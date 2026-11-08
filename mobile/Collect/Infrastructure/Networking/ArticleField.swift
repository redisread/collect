import Foundation

enum ArticleField: String, Codable, Sendable, CaseIterable {
  case isRead, isStarred, isReadLater, readingProgress
}
