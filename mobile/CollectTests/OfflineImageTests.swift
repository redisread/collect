import Foundation
import Testing

@testable import Collect

struct OfflineImageTests {
  @Test func invalidImageDataIsNotCached() {
    #expect(CacheFiles.imageMIME(Data("<html>error</html>".utf8)) == nil)
  }
  @Test @MainActor func imageURLPrefixesDoNotCorruptCachedSources() throws {
    let owner = UUID().uuidString
    let article = try JSONDecoder().decode(
      ArticleDTO.self,
      from: Data(
        """
        {"id":"a","feedId":"f","title":"A","url":"https://example.com","readVersion":0,"starVersion":0,"laterVersion":0,"progressVersion":0}
        """.utf8))
    let record = try CachedArticle(owner: owner, article: article)
    record.imageURLs = ["https://example.com/image", "https://example.com/image?w=600"]
    try FileManager.default.createDirectory(at: CacheFiles.root, withIntermediateDirectories: true)
    let bytes = try #require(
      Data(
        base64Encoded:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII="
      ))
    for url in record.imageURLs { try bytes.write(to: CacheFiles.image(owner: owner, url: url)) }
    #expect(CacheFiles.imageMIME(bytes.prefix(33)) == nil)
    #expect(CacheFiles.imageMIME(bytes.prefix(40)) == nil)
    defer {
      for url in record.imageURLs {
        try? FileManager.default.removeItem(at: CacheFiles.image(owner: owner, url: url))
      }
    }
    let html =
      "<img src=\"https://example.com/image\"><img src=\"https://example.com/image?w=600\"><a href=\"https://example.com/image\">Source</a>"
    let output = CacheFiles.inlineImages(html, record: record)
    #expect(output.components(separatedBy: "src=\"data:image/png;base64,").count == 3)
    #expect(!output.contains("?w=600"))
    #expect(output.contains("href=\"https://example.com/image\""))
  }
}
