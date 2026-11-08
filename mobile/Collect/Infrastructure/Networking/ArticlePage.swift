import Foundation

struct ArticlePage: Decodable, Sendable {
  var articles: [ArticleDTO]
  var next: String?
}
