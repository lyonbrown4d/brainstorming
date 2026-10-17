package com.brainstorming.nativebridge

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import java.io.ByteArrayInputStream
import java.io.File

@InvokeArg class CaptureArguments {
    lateinit var id: String
    lateinit var html: String
    lateinit var baseURL: String
    lateinit var outputPath: String
}
@InvokeArg class CancelCaptureArguments { lateinit var id: String }

class LinkPreview(private val activity: Activity, private val io: java.util.concurrent.Executor) {
    private val pending = mutableMapOf<String, Capture>()
    private val handler = Handler(Looper.getMainLooper())
    fun capture(invoke: Invoke) {
        val args = invoke.parseArgs(CaptureArguments::class.java)
        io.execute {
            try {
                require(args.html.toByteArray().size <= 4 * 1024 * 1024)
                require(File(args.outputPath).canonicalPath.startsWith(activity.applicationInfo.dataDir + "/"))
                activity.runOnUiThread {
                    if (pending.containsKey(args.id)) { invoke.reject("网页预览请求已存在"); return@runOnUiThread }
                    val capture = Capture(args, invoke)
                    pending[args.id] = capture
                    capture.start()
                }
            } catch (_: Exception) { invoke.reject("网页预览参数无效") }
        }
    }
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelCaptureArguments::class.java)
        activity.runOnUiThread { pending[args.id]?.finish("网页预览已取消"); invoke.resolve() }
    }
    private inner class Capture(private val args: CaptureArguments, private val invoke: Invoke) {
        private var finished = false
        private val webview = WebView(activity)
        fun start() {
            with(webview.settings) {
                javaScriptEnabled = false
                domStorageEnabled = false
                databaseEnabled = false
                allowFileAccess = false
                allowContentAccess = false
                blockNetworkLoads = true
                blockNetworkImage = true
                cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
            }
            webview.isClickable = false
            webview.isFocusable = false
            webview.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                    val scheme = request?.url?.scheme
                    if (scheme != "data" && scheme != "about") return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf()))
                    return null
                }
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun onPageFinished(view: WebView?, url: String?) {
                    handler.postDelayed({ snapshot() }, 100)
                }
            }
            val root = activity.findViewById<android.view.ViewGroup>(android.R.id.content)
            root.addView(webview, FrameLayout.LayoutParams(1200, 800))
            webview.translationX = -1400f
            webview.measure(android.view.View.MeasureSpec.makeMeasureSpec(1200, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(800, android.view.View.MeasureSpec.EXACTLY))
            webview.layout(0, 0, 1200, 800)
            val csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'; connect-src 'none'\">"
            webview.loadDataWithBaseURL("about:blank", csp + args.html, "text/html", "UTF-8", null)
            handler.postDelayed({ finish("网页预览超时") }, 12000)
        }
        private fun snapshot() {
            if (finished) return
            try {
                val bitmap = Bitmap.createBitmap(1200, 800, Bitmap.Config.ARGB_8888)
                webview.draw(Canvas(bitmap))
                io.execute {
                    val error = try {
                        File(args.outputPath).outputStream().use { require(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
                        null
                    } catch (_: Exception) { "无法保存网页预览" }
                    finally { bitmap.recycle() }
                    activity.runOnUiThread {
                        if (finished) io.execute { File(args.outputPath).delete() }
                        else finish(error)
                    }
                }
            } catch (_: Exception) { finish("无法生成网页预览") }
        }
        fun finish(error: String?) {
            if (finished) return
            finished = true
            pending.remove(args.id)
            webview.stopLoading()
            (webview.parent as? android.view.ViewGroup)?.removeView(webview)
            webview.destroy()
            if (error == null) invoke.resolve(JSObject().put("outputPath", args.outputPath)) else invoke.reject(error)
        }
    }
}
