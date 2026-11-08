import CryptoKit
import Foundation

enum CacheFiles {
    static var root: URL { URL.cachesDirectory.appendingPathComponent("CollectOffline", isDirectory: true) }
    static func key(owner: String, url: String) -> String {
        SHA256.hash(data: Data((owner + "\n" + url).utf8)).map { String(format: "%02x", $0) }.joined()
    }
    static func file(_ key: String) -> URL { root.appendingPathComponent(key) }
    static func image(owner: String, url: String) -> URL { file(key(owner: owner, url: url)) }
    static func isComplete(_ record: CachedArticle) -> Bool {
        record.bodyHTML != nil && record.imageURLs.allSatisfy {
            FileManager.default.fileExists(atPath: image(owner: record.owner, url: $0).path)
        }
    }
    static func inlineImages(_ html: String, record: CachedArticle) -> String {
        var result = html
        for source in record.imageURLs {
            guard let data = try? Data(contentsOf: image(owner: record.owner, url: source)) else { continue }
            let mime: String
            if data.starts(with: [0x89, 0x50, 0x4e, 0x47]) { mime = "image/png" }
            else if data.starts(with: [0x47, 0x49, 0x46]) { mime = "image/gif" }
            else if data.starts(with: [0x52, 0x49, 0x46, 0x46]) { mime = "image/webp" }
            else { mime = "image/jpeg" }
            result = result.replacingOccurrences(of: source.replacingOccurrences(of: "&", with: "&amp;"),
                with: "data:\(mime);base64,\(data.base64EncodedString())")
        }
        return result
    }
}
