import Foundation
import SwiftData

@Model
final class CachedCatalog {
  @Attribute(.unique) var owner: String
  var feeds: Data
  var folders: Data
  var syncCursor: Int64?
  var preferences: Data?
  var notices: [String] = []
  init(owner: String, feeds: Data, folders: Data) {
    self.owner = owner
    self.feeds = feeds
    self.folders = folders
  }
}
