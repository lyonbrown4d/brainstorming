import Foundation
import Tauri
import UIKit

struct ExportArguments: Decodable { let path: String; let suggestedName: String }
private var activeExport: NativeFileExport?

extension NativeBridgePlugin {
    @objc public func exportFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ExportArguments.self)
        let source = URL(fileURLWithPath: args.path).standardizedFileURL
        ioQueue.async {
            guard source.path.hasPrefix(NSHomeDirectory() + "/"), FileManager.default.fileExists(atPath: source.path) else {
                invoke.reject("导出文件无效"); return
            }
            DispatchQueue.main.async {
                guard activeExport == nil else { invoke.reject("已有文件对话框正在使用"); return }
                let export = NativeFileExport(source: source, invoke: invoke, owner: self)
                activeExport = export
                export.present()
            }
        }
    }
}
private class NativeFileExport: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    let source: URL
    let invoke: Invoke
    let owner: NativeBridgePlugin
    private var completed = false
    init(source: URL, invoke: Invoke, owner: NativeBridgePlugin) { self.source = source; self.invoke = invoke; self.owner = owner }
    func present() {
        guard let controller = owner.manager.viewController else { finish(uri: nil, error: "应用窗口不可用"); return }
        let picker = UIDocumentPickerViewController(forExporting: [source], asCopy: true)
        picker.delegate = self
        picker.presentationController?.delegate = self
        controller.present(picker, animated: true)
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let target = urls.first else { finish(uri: nil, error: nil); return }
        owner.ioQueue.async {
            let access = target.startAccessingSecurityScopedResource()
            self.owner.rememberURL(target, uri: target.absoluteString)
            if access { target.stopAccessingSecurityScopedResource() }
            DispatchQueue.main.async { self.finish(uri: target.absoluteString, error: nil) }
        }
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(uri: nil, error: nil) }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(uri: nil, error: nil) }
    private func finish(uri: String?, error: String?) {
        guard !completed else { return }
        completed = true
        activeExport = nil
        if let error = error { invoke.reject(error) }
        else { invoke.resolve(["uri": uri as Any?]) }
    }
}
