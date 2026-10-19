import AppKit
import Quartz

final class PreviewViewController: NSViewController, QLPreviewingController {
    private let imageView = NSImageView()
    private let sheetsMenu = NSPopUpButton()
    private var images: [SheetImage] = []

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 900, height: 640))
        imageView.imageScaling = .scaleProportionallyDown
        imageView.translatesAutoresizingMaskIntoConstraints = false
        sheetsMenu.translatesAutoresizingMaskIntoConstraints = false
        sheetsMenu.target = self
        sheetsMenu.action = #selector(selectSheet)
        view.addSubview(sheetsMenu)
        view.addSubview(imageView)
        NSLayoutConstraint.activate([
            sheetsMenu.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            sheetsMenu.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            sheetsMenu.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
            imageView.topAnchor.constraint(equalTo: sheetsMenu.bottomAnchor, constant: 12),
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -16)
        ])
        preferredContentSize = NSSize(width: 900, height: 640)
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        do {
            images = try PreviewReader.read(url, coverOnly: false)
            _ = view
            sheetsMenu.removeAllItems()
            sheetsMenu.addItems(withTitles: images.map { $0.name })
            sheetsMenu.isHidden = images.count < 2
            selectSheet()
            handler(nil)
        } catch { handler(error) }
    }

    @objc private func selectSheet() {
        let index = sheetsMenu.indexOfSelectedItem
        guard images.indices.contains(index) else { return }
        imageView.image = NSImage(data: images[index].bytes)
        imageView.setAccessibilityLabel(images[index].name)
    }
}
