import Foundation
import Tauri
import UIKit
import WebKit

struct CaptureArguments: Decodable { let id: String; let html: String; let baseURL: String; let outputPath: String }
struct CancelCaptureArguments: Decodable { let id: String }

private var activeCaptures: [String: StaticPreviewCapture] = [:]

extension NativeBridgePlugin {
    @objc public func captureLinkPreview(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(CaptureArguments.self)
        guard args.html.utf8.count <= 4 * 1024 * 1024,
              args.outputPath.hasPrefix(NSHomeDirectory() + "/"),
              let baseURL = URL(string: args.baseURL), ["http", "https"].contains(baseURL.scheme ?? "") else {
            invoke.reject("网页预览参数无效"); return
        }
        DispatchQueue.main.async {
            guard activeCaptures[args.id] == nil else { invoke.reject("网页预览请求已存在"); return }
            let capture = StaticPreviewCapture(arguments: args, invoke: invoke)
            activeCaptures[args.id] = capture
            capture.start()
        }
    }
    @objc public func cancelLinkPreview(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(CancelCaptureArguments.self)
        DispatchQueue.main.async {
            activeCaptures[args.id]?.finish(error: "网页预览已取消")
            invoke.resolve()
        }
    }
}

private class StaticPreviewCapture: NSObject, WKNavigationDelegate {
    private let args: CaptureArguments
    private let invoke: Invoke
    private var webview: WKWebView?
    private var finished = false
    init(arguments: CaptureArguments, invoke: Invoke) { self.args = arguments; self.invoke = invoke }
    func start() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptEnabled = false
        configuration.userContentController = WKUserContentController()
        let rules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}},{"trigger":{"url-filter":"^file://"},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "brainstorming-static-preview", encodedContentRuleList: rules) { [weak self] list, error in
            DispatchQueue.main.async {
                guard let self = self, !self.finished, let list = list, error == nil else {
                    self?.finish(error: "无法隔离网页预览网络"); return
                }
                configuration.userContentController.add(list)
                let view = WKWebView(frame: CGRect(x: -1400, y: 0, width: 1200, height: 800), configuration: configuration)
                view.navigationDelegate = self
                view.isUserInteractionEnabled = false
                view.scrollView.isScrollEnabled = false
                self.webview = view
                let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
                guard let root = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController?.view else {
                    self.finish(error: "应用窗口不可用"); return
                }
                root.addSubview(view)
                // Network is blocked at WebKit's resource layer; the page has no Tauri bridge,
                // persistent cookies, JavaScript, or access to application files.
                let csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'none'; connect-src 'none'\">"
                view.loadHTMLString(csp + self.args.html, baseURL: URL(string: "about:blank"))
                DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in self?.finish(error: "网页预览超时") }
            }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = navigationAction.request.url?.scheme ?? ""
        decisionHandler(["about", "data"].contains(scheme) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !finished else { return }
        let snapshot = WKSnapshotConfiguration()
        snapshot.rect = CGRect(x: 0, y: 0, width: 1200, height: 800)
        webView.takeSnapshot(with: snapshot) { [weak self] image, error in
            guard let self = self, !self.finished, error == nil, let image = image else {
                self?.finish(error: "无法生成网页预览"); return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                let path = URL(fileURLWithPath: self.args.outputPath)
                var failure: String?
                do {
                    guard let bytes = image.pngData() else { throw NSError(domain: "Brainstorming", code: 1) }
                    try bytes.write(to: path, options: .atomic)
                } catch { failure = "无法保存网页预览" }
                DispatchQueue.main.async {
                    if self.finished {
                        DispatchQueue.global(qos: .utility).async { try? FileManager.default.removeItem(at: path) }
                    } else { self.finish(error: failure) }
                }
            }
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error: "网页预览加载失败") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error: "网页预览加载失败") }
    func finish(error: String?) {
        guard !finished else { return }
        finished = true
        webview?.stopLoading()
        webview?.navigationDelegate = nil
        webview?.removeFromSuperview()
        webview = nil
        activeCaptures.removeValue(forKey: args.id)
        if let error = error { invoke.reject(error) } else { invoke.resolve(["outputPath": args.outputPath]) }
    }
}
