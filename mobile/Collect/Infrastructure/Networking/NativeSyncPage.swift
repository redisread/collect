import Foundation

struct NativeSyncPage: Decodable, Sendable {
  struct Deletion: Decodable, Sendable {
    let kind: String
    let id: String
  }
  let cursor: Int64
  let hasMore: Bool
  let articles: [ArticleDTO]
  let feeds: [FeedDTO]
  let folders: [FolderDTO]
  let deleted: [Deletion]
  let preferences: ReaderPreferences?
}
