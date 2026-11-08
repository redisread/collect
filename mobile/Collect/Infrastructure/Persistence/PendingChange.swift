import Foundation
import SwiftData

@Model
final class PendingChange {
    @Attribute(.unique) var key: String
    var owner: String
    var articleID: String
    var field: String
    var value: Int
    var version: Int
    var createdAt: Date
    init(owner: String, articleID: String, field: ArticleField, value: Int, version: Int) {
        key = owner + ":" + articleID + ":" + field.rawValue
        self.owner = owner
        self.articleID = articleID
        self.field = field.rawValue
        self.value = value
        self.version = version
        createdAt = .now
    }
}
