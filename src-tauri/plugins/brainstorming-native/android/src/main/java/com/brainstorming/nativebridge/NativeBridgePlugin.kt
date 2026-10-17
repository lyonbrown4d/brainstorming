package com.brainstorming.nativebridge

import android.app.Activity
import androidx.appcompat.app.AppCompatDelegate
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg class ClipboardArguments { lateinit var contents: String; lateinit var plainText: String; lateinit var mimeType: String }
@InvokeArg class ClipboardReadArguments { lateinit var mimeType: String }
@InvokeArg class AppearanceArguments { lateinit var theme: String }
@InvokeArg class SecretArguments { lateinit var value: String }
@InvokeArg class FileArguments { lateinit var uri: String; var path: String? = null }

@TauriPlugin
class NativeBridgePlugin(private val host: Activity) : Plugin(host) {
    private val previews by lazy { LinkPreview(host, io) }
    @Command fun captureLinkPreview(invoke: Invoke) = previews.capture(invoke)
    @Command fun cancelLinkPreview(invoke: Invoke) = previews.cancel(invoke)
    private val io = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val keyAlias = "brainstorming.ai-api-key"
    private val preferences get() = host.getSharedPreferences("brainstorming-secure", Context.MODE_PRIVATE)
    private fun clipboard() = host.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    @Command fun writeClipboard(invoke: Invoke) {
        val args = invoke.parseArgs(ClipboardArguments::class.java)
        io.execute {
            if (args.contents.toByteArray().size > 56 * 1024 * 1024 || args.plainText.toByteArray().size > 256 * 1024) {
                invoke.reject("剪贴板内容超过 Android 系统限制"); return@execute
            }
            try {
                // Large typed data stays outside Android's Binder payload.
                val folder = File(host.cacheDir, "topic-clipboard").apply { mkdirs() }
                folder.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 60 * 60 * 1000 }?.forEach { it.delete() }
                val file = File(folder, "${java.util.UUID.randomUUID()}.json")
                file.writeText(args.contents, Charsets.UTF_8)
                val uri = androidx.core.content.FileProvider.getUriForFile(host, "${host.packageName}.brainstorming.clipboard", file)
                val data = ClipData(ClipDescription("Brainstorming", arrayOf("text/plain", args.mimeType)), ClipData.Item(args.plainText))
                data.addItem(ClipData.Item(uri))
                host.runOnUiThread {
                    try { clipboard().setPrimaryClip(data); invoke.resolve() }
                    catch (_: Exception) { invoke.reject("无法写入系统剪贴板") }
                }
            } catch (_: Exception) { invoke.reject("无法写入系统剪贴板") }
        }
    }
    @Command fun readClipboard(invoke: Invoke) {
        val args = invoke.parseArgs(ClipboardReadArguments::class.java)
        host.runOnUiThread {
            val clip = try { clipboard().primaryClip }
            catch (_: Exception) { invoke.reject("无法读取系统剪贴板"); return@runOnUiThread }
            io.execute {
                try {
                    var contents = ""
                    if (clip != null) {
                        if (clip.description.hasMimeType(args.mimeType)) {
                            for (index in 0 until clip.itemCount) {
                                val uri = clip.getItemAt(index).uri ?: continue
                                if (uri.authority != "${host.packageName}.brainstorming.clipboard") continue
                                host.contentResolver.openInputStream(uri)?.use { source ->
                                    val output = java.io.ByteArrayOutputStream()
                                    val buffer = ByteArray(256 * 1024)
                                    while (true) {
                                        val size = source.read(buffer)
                                        if (size < 0) break
                                        require(output.size() + size <= 56 * 1024 * 1024)
                                        output.write(buffer, 0, size)
                                    }
                                    contents = output.toString("UTF-8")
                                }
                                if (contents.isNotEmpty()) break
                            }
                        }
                        if (contents.isEmpty() && clip.itemCount > 0) contents = clip.getItemAt(0).coerceToText(host)?.toString() ?: ""
                    }
                    require(contents.toByteArray().size <= 56 * 1024 * 1024)
                    invoke.resolve(JSObject().put("contents", contents))
                } catch (_: Exception) { invoke.reject("无法读取系统剪贴板") }
            }
        }
    }
    @Command fun setAppearance(invoke: Invoke) {
        val args = invoke.parseArgs(AppearanceArguments::class.java)
        if (args.theme !in setOf("light", "dark", "system")) { invoke.reject("应用外观无效"); return }
        host.runOnUiThread {
            val mode = when (args.theme) {
                "light" -> AppCompatDelegate.MODE_NIGHT_NO
                "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
            AppCompatDelegate.setDefaultNightMode(mode)
            val systemDark = host.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES
            val light = mode == AppCompatDelegate.MODE_NIGHT_NO || (mode == AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM && !systemDark)
            host.window.statusBarColor = if (light) android.graphics.Color.WHITE else android.graphics.Color.rgb(37, 40, 48)
            host.window.navigationBarColor = host.window.statusBarColor
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                val flags = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                host.window.insetsController?.setSystemBarsAppearance(if (light) flags else 0, flags)
            } else {
                @Suppress("DEPRECATION")
                host.window.decorView.systemUiVisibility = if (light) android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else 0
            }
            invoke.resolve()
        }
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(keyAlias, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return generator.generateKey()
    }
    @Command fun writeSecret(invoke: Invoke) { io.execute {
        val args = invoke.parseArgs(SecretArguments::class.java)
        if (args.value.toByteArray().size > 8192) { invoke.reject("密钥格式无效"); return@execute }
        try {
            if (args.value.isEmpty()) {
                if (!preferences.edit().remove("ciphertext").remove("iv").commit()) throw IllegalStateException()
            } else {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, key())
                val encrypted = cipher.doFinal(args.value.toByteArray(Charsets.UTF_8))
                if (!preferences.edit().putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).commit()) throw IllegalStateException()
            }
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("系统安全存储不可用") }
        }
    }
    @Command fun readSecret(invoke: Invoke) { io.execute {
        try {
            val stored = preferences.getString("ciphertext", null)
            if (stored == null) { invoke.resolve(JSObject().put("value", org.json.JSONObject.NULL)); return@execute }
            val iv = Base64.decode(preferences.getString("iv", null), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val value = String(cipher.doFinal(Base64.decode(stored, Base64.NO_WRAP)), Charsets.UTF_8)
            invoke.resolve(JSObject().put("value", value))
        } catch (_: Exception) { invoke.reject("系统安全存储不可用") }
        }
    }
    @Command fun stageFile(invoke: Invoke) { io.execute {
        val args = invoke.parseArgs(FileArguments::class.java)
        try {
            val uri = Uri.parse(args.uri)
            require(uri.scheme == "content" || uri.scheme == "file")
            if (uri.scheme == "content") {
                try { host.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
                catch (_: SecurityException) { /* Some providers grant only the current session. The app-local copy remains safe. */ }
            }
            var name = uri.lastPathSegment ?: "Document.brainstorming"
            if (uri.scheme == "content") host.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) name = it.getString(0)
            }
            name = File(name).name.replace(Regex("[\\x00-\\x1f/\\\\]"), "_")
            val folder = File(host.filesDir, "native-documents/${java.util.UUID.randomUUID()}").apply { mkdirs() }
            val destination = File(folder, name)
            host.contentResolver.openInputStream(uri).use { source ->
                requireNotNull(source)
                destination.outputStream().use { output -> source.copyTo(output, 256 * 1024) }
            }
            invoke.resolve(JSObject().put("path", destination.absolutePath))
        } catch (_: Exception) { invoke.reject("无法读取所选文件") }
        }
    }
    @Command fun writeFile(invoke: Invoke) { io.execute {
        val args = invoke.parseArgs(FileArguments::class.java)
        try {
            val source = File(requireNotNull(args.path))
            require(source.isFile)
            val uri = Uri.parse(args.uri)
            require(uri.scheme == "content" || uri.scheme == "file")
            if (uri.scheme == "content") {
                try { host.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
                catch (_: SecurityException) { /* Some providers grant only the current session. The app-local copy remains safe. */ }
            }
            host.contentResolver.openOutputStream(uri, "rwt").use { output ->
                requireNotNull(output)
                source.inputStream().use { it.copyTo(output, 256 * 1024) }
                output.flush()
            }
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("无法写入所选文件，应用内副本已保留") }
        }
    }
}
