import Foundation

struct ReaderPreferences: Codable, Sendable {
  let articleRetentionDays: Int
  let translationTargetLanguage: String
  var articleSortOrder: String? = nil
}

struct RetentionPreview: Codable, Sendable {
  let days: Int
  let previousDays: Int
  let count: Int
}
