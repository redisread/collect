import Foundation

struct ArticleDTO: Codable, Identifiable, Sendable, Equatable {
  let id: String
  var contentVersion: Int?
  var expiresAt: String?
  var isExtracted: Bool?
  var feedId: String
  var title: String
  var url: String
  var summary: String?
  var author: String?
  var publishedAt: String?
  var imageUrl: String?
  var content: String?
  var images: [String]?
  var isRead: Bool?
  var isStarred: Bool?
  var isReadLater: Bool?
  var readingProgress: Int?
  var readVersion: Int
  var starVersion: Int
  var laterVersion: Int
  var progressVersion: Int

  func version(for field: ArticleField) -> Int {
    switch field {
    case .isRead: readVersion
    case .isStarred: starVersion
    case .isReadLater: laterVersion
    case .readingProgress: progressVersion
    }
  }
  func value(for field: ArticleField) -> Int {
    switch field {
    case .isRead: isRead == true ? 1 : 0
    case .isStarred: isStarred == true ? 1 : 0
    case .isReadLater: isReadLater == true ? 1 : 0
    case .readingProgress: readingProgress ?? 0
    }
  }
  mutating func set(_ field: ArticleField, value: Int) {
    switch field {
    case .isRead: isRead = value != 0
    case .isStarred: isStarred = value != 0
    case .isReadLater: isReadLater = value != 0
    case .readingProgress: readingProgress = value
    }
  }
}
