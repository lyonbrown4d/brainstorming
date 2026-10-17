import Foundation
import Tauri
import UIKit
import Security

struct ClipboardArguments: Decodable { let contents: String; let plainText: String; let mimeType: String }
struct ClipboardReadArguments: Decodable { let mimeType: String }
struct AppearanceArguments: Decodable { let theme: String }
struct SecretArguments: Decodable { let value: String }
struct FileArguments: Decodable { let uri: String; let path: String? }

class NativeBridgePlugin: Plugin {
    let ioQueue = DispatchQueue(label: "brainstorming.native-io", qos: .userInitiated)
    private let keyService = "com.brainstorming.app"
    private let keyAccount = "ai-api-key"
    @objc public func writeClipboard(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ClipboardArguments.self)
        guard args.contents.utf8.count <= 56 * 1024 * 1024, args.plainText.utf8.count <= 10 * 1024 * 1024 else {
            invoke.reject("剪贴板内容过大"); return
        }
        DispatchQueue.main.async {
            UIPasteboard.general.items = [["public.utf8-plain-text": args.plainText,
                args.mimeType: Data(args.contents.utf8)]]
            invoke.resolve()
        }
    }
    @objc public func readClipboard(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ClipboardReadArguments.self)
        DispatchQueue.main.async {
            let board = UIPasteboard.general
            let contents = board.data(forPasteboardType: args.mimeType).flatMap { String(data: $0, encoding: .utf8) } ?? board.string ?? ""
            guard contents.utf8.count <= 56 * 1024 * 1024 else { invoke.reject("剪贴板内容过大"); return }
            invoke.resolve(["contents": contents])
        }
    }
    @objc public func setAppearance(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(AppearanceArguments.self)
        guard ["light", "dark", "system"].contains(args.theme) else { invoke.reject("应用外观无效"); return }
        let style: UIUserInterfaceStyle = args.theme == "system" ? .unspecified : (args.theme == "dark" ? .dark : .light)
        DispatchQueue.main.async {
            for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                for window in scene.windows { window.overrideUserInterfaceStyle = style }
            }
            invoke.resolve()
        }
    }
    private func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keyService,
         kSecAttrAccount as String: keyAccount]
    }
    @objc public func readSecret(_ invoke: Invoke) {
        ioQueue.async {
            var input = self.query()
            input[kSecReturnData as String] = true
            input[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            let status = SecItemCopyMatching(input as CFDictionary, &result)
            if status == errSecItemNotFound { invoke.resolve(["value": NSNull()]); return }
            guard status == errSecSuccess, let data = result as? Data,
                  let value = String(data: data, encoding: .utf8) else { invoke.reject("系统安全存储不可用"); return }
            invoke.resolve(["value": value])
        }
    }
    @objc public func writeSecret(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SecretArguments.self)
        ioQueue.async {
            guard args.value.utf8.count <= 8192 else { invoke.reject("密钥格式无效"); return }
            let deletion = SecItemDelete(self.query() as CFDictionary)
            guard deletion == errSecSuccess || deletion == errSecItemNotFound else { invoke.reject("无法更新安全存储"); return }
            if args.value.isEmpty { invoke.resolve(); return }
            var input = self.query()
            input[kSecValueData as String] = Data(args.value.utf8)
            input[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(input as CFDictionary, nil) == errSecSuccess else { invoke.reject("无法保存密钥"); return }
            invoke.resolve()
        }
    }
    private func sourceURL(_ uri: String) -> URL? {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: "brainstorming.file-bookmark." + uri) {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: data, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &stale) { return url }
        }
        if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
        return URL(string: uri)
    }
    func rememberURL(_ source: URL, uri: String) {
        if let bookmark = try? source.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(bookmark, forKey: "brainstorming.file-bookmark." + uri)
        }
    }
    @objc public func stageFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(FileArguments.self)
        ioQueue.async {
            guard let source = self.sourceURL(args.uri), source.isFileURL else { invoke.reject("文件地址无效"); return }
            let access = source.startAccessingSecurityScopedResource()
            self.rememberURL(source, uri: args.uri)
            defer { if access { source.stopAccessingSecurityScopedResource() } }
            let manager = FileManager.default
            let root = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("native-documents", isDirectory: true)
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            do { try manager.createDirectory(at: root, withIntermediateDirectories: true) }
            catch { invoke.reject("无法创建文档副本"); return }
            let destination = root.appendingPathComponent(source.lastPathComponent)
            var coordinationError: NSError?
            var operationError: Error?
            NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordinationError) { coordinated in
                do { try manager.copyItem(at: coordinated, to: destination) }
                catch { operationError = error }
            }
            guard coordinationError == nil && operationError == nil else { invoke.reject("无法读取所选文档"); return }
            invoke.resolve(["path": destination.path])
        }
    }
    @objc public func writeFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(FileArguments.self)
        ioQueue.async {
            guard let path = args.path, let target = self.sourceURL(args.uri), target.isFileURL else { invoke.reject("文件地址无效"); return }
            let access = target.startAccessingSecurityScopedResource()
            self.rememberURL(target, uri: args.uri)
            defer { if access { target.stopAccessingSecurityScopedResource() } }
            // NSData's atomic writer replaces a sibling temporary file instead of truncating the document.
            var coordinationError: NSError?
            var operationError: Error?
            NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &coordinationError) { coordinated in
                do { try Data(contentsOf: URL(fileURLWithPath: path), options: .mappedIfSafe).write(to: coordinated, options: .atomic) }
                catch { operationError = error }
            }
            guard coordinationError == nil && operationError == nil else { invoke.reject("无法写入所选文档，应用内副本已保留"); return }
            invoke.resolve()
        }
    }
}
@_cdecl("init_plugin_brainstorming_native")
public func initPlugin() -> Plugin { NativeBridgePlugin() }
