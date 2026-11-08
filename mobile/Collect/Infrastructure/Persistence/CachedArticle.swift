import Foundation
import SwiftData

@Model
final class CachedArticle {
  @Attribute(.unique) var key: String
  var owner: String
  var articleID: String
  var payload: Data
  var bodyHTML: String?
  var imageURLs: [String]
  var cachedAt: Date?
  var readAt: Date?
  var translatedHTML: String?
  var bilingualHTML: String?
  var translationLanguage: String?

  init(owner: String, article: ArticleDTO) throws {
    self.key = owner + ":" + article.id
    self.owner = owner
    self.articleID = article.id
    self.payload = try JSONEncoder().encode(article)
    self.imageURLs = []
  }
  func decode() throws -> ArticleDTO { try JSONDecoder().decode(ArticleDTO.self, from: payload) }
}
