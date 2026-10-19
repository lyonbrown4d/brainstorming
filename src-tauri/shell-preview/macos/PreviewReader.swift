import Foundation
import SQLite3
import ImageIO

struct SheetImage {
    let name: String
    let bytes: Data
    let width: Int
    let height: Int
}

enum PreviewFailure: Error { case unavailable }
private final class ReadBudget {
    let deadline = DispatchTime.now().uptimeNanoseconds + 2_000_000_000
}

// System SQLite opens plaintext files only. No SQLCipher key or application API
// is linked into the extension; old and encrypted documents keep the generic icon.
enum PreviewReader {
    static func read(_ url: URL, coverOnly: Bool) throws -> [SheetImage] {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        guard try handle.read(upToCount: 16) == Data("SQLite format 3\0".utf8) else {
            throw PreviewFailure.unavailable
        }
        var connection: OpaquePointer?
        guard sqlite3_open_v2(url.path, &connection, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK,
              let db = connection else {
            if let db = connection { sqlite3_close(db) }
            throw PreviewFailure.unavailable
        }
        defer { sqlite3_close(db) }
        sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 1_052_672)
        sqlite3_limit(db, SQLITE_LIMIT_SQL_LENGTH, 16_384)
        sqlite3_busy_timeout(db, 250)
        let budget = ReadBudget()
        sqlite3_progress_handler(db, 1000, { context in
            guard let context else { return 1 }
            let budget = Unmanaged<ReadBudget>.fromOpaque(context).takeUnretainedValue()
            return DispatchTime.now().uptimeNanoseconds > budget.deadline ? 1 : 0
        }, Unmanaged.passUnretained(budget).toOpaque())
        defer { sqlite3_progress_handler(db, 0, nil, nil); withExtendedLifetime(budget) {} }
        guard sqlite3_exec(db, "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF", nil, nil, nil) == SQLITE_OK,
              try integer(db, "PRAGMA application_id") == 0x42524e54,
              try integer(db, "PRAGMA user_version") == 2,
              try integer(db, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('document_previews','document_preview_state','sheets') AND sql NOT LIKE '%VIRTUAL%'") == 3
        else { throw PreviewFailure.unavailable }
        let query = """
        SELECT s.name,p.width,p.height,p.png FROM document_previews p
        JOIN sheets s ON s.id=p.sheet_id JOIN document_preview_state d ON d.id=1
        WHERE p.version=1 AND p.source_hash=d.content_hash
        AND length(p.png) BETWEEN 1 AND 1048576
        AND p.width BETWEEN 1 AND 1600 AND p.height BETWEEN 1 AND 1600
        AND (?1=0 OR p.sheet_id=d.cover_sheet_id)
        ORDER BY (p.sheet_id=d.cover_sheet_id) DESC,s.position LIMIT 128
        """
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else { throw PreviewFailure.unavailable }
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_int(statement, 1, coverOnly ? 1 : 0)
        var images: [SheetImage] = []
        var total = 0
        var status = sqlite3_step(statement)
        while status == SQLITE_ROW {
            let count = Int(sqlite3_column_bytes(statement, 3))
            total += count
            guard count > 0, total <= 16 * 1024 * 1024,
                  let bytes = sqlite3_column_blob(statement, 3),
                  let name = sqlite3_column_text(statement, 0),
                  sqlite3_column_bytes(statement, 0) <= 4096 else { throw PreviewFailure.unavailable }
            let data = Data(bytes: bytes, count: count)
            let width = Int(sqlite3_column_int(statement, 1))
            let height = Int(sqlite3_column_int(statement, 2))
            guard data.starts(with: [137,80,78,71,13,10,26,10]),
                  let source = CGImageSourceCreateWithData(data as CFData, nil),
                  CGImageSourceGetCount(source) == 1,
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  properties[kCGImagePropertyPixelWidth] as? Int == width,
                  properties[kCGImagePropertyPixelHeight] as? Int == height,
                  CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) != nil,
                  CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete,
                  DispatchTime.now().uptimeNanoseconds <= budget.deadline else { throw PreviewFailure.unavailable }
            images.append(SheetImage(name: String(cString: name), bytes: data, width: width, height: height))
            status = sqlite3_step(statement)
        }
        guard status == SQLITE_DONE, !images.isEmpty else { throw PreviewFailure.unavailable }
        return images
    }

    private static func integer(_ db: OpaquePointer, _ query: String) throws -> Int64 {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else { throw PreviewFailure.unavailable }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { throw PreviewFailure.unavailable }
        return sqlite3_column_int64(statement, 0)
    }
}
