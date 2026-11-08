import Foundation

struct SubscriptionBatchResponse: Decodable, Sendable {
  let feeds: [FeedDTO]
  let articles: [ArticleDTO]?
}

struct FolderOrderResponse: Decodable, Sendable {
  let folders: [FolderDTO]
}
