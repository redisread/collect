import Foundation
import SwiftData
import Testing

@testable import Collect

// Frozen catalog shape shipped before incremental sync. Entity name matches the existing store.
private enum LegacyCatalogSchema: VersionedSchema {
  static let versionIdentifier = Schema.Version(1, 0, 0)
  static var models: [any PersistentModel.Type] {
    [CachedArticle.self, PendingChange.self, CachedCatalog.self]
  }
  @Model final class CachedCatalog {
    @Attribute(.unique) var owner: String
    var feeds: Data
    var folders: Data
    var notices: [String] = []
    init(owner: String, feeds: Data, folders: Data) {
      self.owner = owner
      self.feeds = feeds
      self.folders = folders
    }
  }
}

struct CatalogMigrationTests {
  @Test @MainActor func existingCatalogGainsOptionalCursorWithoutLosingData() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("catalog.store")
    try createLegacyStore(at: url)
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self), configurations: ModelConfiguration(url: url)
    )
    let catalog = try #require(container.mainContext.fetch(FetchDescriptor<CachedCatalog>()).first)
    #expect(catalog.owner == "owner")
    #expect(catalog.notices == ["保留离线冲突提示"])
    #expect(catalog.syncCursor == nil)
    #expect(catalog.preferences == nil)
  }

  @MainActor private func createLegacyStore(at url: URL) throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: LegacyCatalogSchema.self),
      configurations: ModelConfiguration(url: url))
    let catalog = LegacyCatalogSchema.CachedCatalog(
      owner: "owner", feeds: Data("[]".utf8), folders: Data("[]".utf8))
    catalog.notices = ["保留离线冲突提示"]
    container.mainContext.insert(catalog)
    try container.mainContext.save()
  }
}
