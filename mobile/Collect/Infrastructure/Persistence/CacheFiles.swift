import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum CacheFiles {
  static var root: URL {
    URL.cachesDirectory.appendingPathComponent("CollectOffline", isDirectory: true)
  }
  static func key(owner: String, url: String) -> String {
    SHA256.hash(data: Data((owner + "\n" + url).utf8)).map { String(format: "%02x", $0) }.joined()
  }
  static func file(_ key: String) -> URL { root.appendingPathComponent(key) }
  static func image(owner: String, url: String) -> URL { file(key(owner: owner, url: url)) }
  static func isComplete(_ record: CachedArticle) -> Bool {
    record.bodyHTML != nil
      && record.imageURLs.allSatisfy {
        FileManager.default.fileExists(atPath: image(owner: record.owner, url: $0).path)
      }
  }
  static func imageMIME(_ data: Data) -> String? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      CGImageSourceGetCount(source) > 0,
      let identifier = CGImageSourceGetType(source),
      let type = UTType(identifier as String), type.conforms(to: .image)
    else { return nil }
    return type.preferredMIMEType
  }
  static func inlineImages(_ html: String, record: CachedArticle) -> String {
    var result = html
    for source in record.imageURLs {
      guard let data = try? Data(contentsOf: image(owner: record.owner, url: source)) else {
        continue
      }
      guard let mime = imageMIME(data) else { continue }
      let attribute = "src=\"" + source.replacingOccurrences(of: "&", with: "&amp;") + "\""
      result = result.replacingOccurrences(
        of: attribute,
        with: "src=\"data:\(mime);base64,\(data.base64EncodedString())\"")
    }
    return result
  }
}
