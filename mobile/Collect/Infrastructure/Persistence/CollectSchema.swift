import SwiftData

enum CollectSchema: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { [CachedArticle.self, PendingChange.self, CachedCatalog.self] }
}
