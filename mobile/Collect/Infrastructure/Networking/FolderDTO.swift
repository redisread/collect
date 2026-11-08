import Foundation

struct FolderDTO: Codable, Identifiable, Sendable, Equatable {
  let id: String
  var sortOrder: Int?
  var name: String
}
