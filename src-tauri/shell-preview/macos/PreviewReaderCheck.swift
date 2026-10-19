import Foundation

@main
struct PreviewReaderCheck {
    static func main() throws {
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        let expected = Int(CommandLine.arguments[2])!
        let before = try Data(contentsOf: url)
        if expected < 0 {
            do {
                _ = try PreviewReader.read(url, coverOnly: false)
                fatalError("Unsupported files must not produce a preview")
            } catch PreviewFailure.unavailable { }
        } else {
            let all = try PreviewReader.read(url, coverOnly: false)
            let cover = try PreviewReader.read(url, coverOnly: true)
            precondition(all.count == expected)
            precondition(cover.count == 1)
            precondition(cover[0].name == "Cover")
            precondition(all[0].name == "Cover")
            precondition(all.allSatisfy { $0.width == 1 && $0.height == 1 })
        }
        let after = try Data(contentsOf: url)
        precondition(after == before, "Shell reads must not modify the document")
        print("Quick Look reader check passed")
    }
}
