import AppKit
import QuickLookThumbnailing

final class ThumbnailProvider: QLThumbnailProvider {
    override func provideThumbnail(for request: QLFileThumbnailRequest,
        _ handler: @escaping (QLThumbnailReply?, Error?) -> Void) {
        do {
            guard let sheet = try PreviewReader.read(request.fileURL, coverOnly: true).first,
                  let image = NSImage(data: sheet.bytes) else { throw PreviewFailure.unavailable }
            let ratio = min(request.maximumSize.width / CGFloat(sheet.width),
                            request.maximumSize.height / CGFloat(sheet.height))
            let size = CGSize(width: CGFloat(sheet.width) * ratio, height: CGFloat(sheet.height) * ratio)
            handler(QLThumbnailReply(contextSize: size, currentContextDrawing: {
                image.draw(in: CGRect(origin: .zero, size: size))
                return true
            }), nil)
        } catch { handler(nil, error) }
    }
}
