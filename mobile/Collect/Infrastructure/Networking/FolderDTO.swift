import Foundation

struct FolderDTO: Codable, Identifiable, Sendable, Equatable {
    let id: String
    var name: String
}
