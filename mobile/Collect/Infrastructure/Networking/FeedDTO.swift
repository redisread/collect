import Foundation

struct FeedDTO: Codable, Identifiable, Sendable, Equatable {
  let id: String
  var autoExtract: Bool?
  var title: String
  var folderId: String?
  var feedUrl: String
  var unreadCount: Int?
}
