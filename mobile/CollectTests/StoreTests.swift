import Foundation
import SwiftData
import Testing

@testable import Collect

actor OfflineTransport: HTTPTransport {
  func send(_ request: URLRequest) async throws -> (Data, Int) {
    throw URLError(.notConnectedToInternet)
  }
}
struct StoreTests {
  @Test @MainActor func offlineEditsCoalesceAndSurviveFailedSync() async throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let article = try JSONDecoder().decode(
      ArticleDTO.self,
      from: Data(
        """
        {"id":"a","feedId":"f","title":"A","url":"https://example.com","isRead":false,"readVersion":4,"starVersion":0,"laterVersion":0,"progressVersion":0}
        """.utf8))
    container.mainContext.insert(try CachedArticle(owner: "owner", article: article))
    try container.mainContext.save()
    let store = LibraryStore(
      container: container,
      api: APIClient(
        baseURL: try #require(URL(string: "https://example.com")), transport: OfflineTransport()),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "test@example.invalid"))
    try store.reloadLocal()
    store.change("a", field: .isRead, value: 1)
    store.change("a", field: .isRead, value: 0)
    let pending = try container.mainContext.fetch(FetchDescriptor<PendingChange>())
    #expect(pending.count == 1)
    #expect(pending.first?.version == 4)
    await store.sync()
    #expect(try container.mainContext.fetchCount(FetchDescriptor<PendingChange>()) == 1)
    #expect(store.articles.first?.isRead == false)
    #expect(store.error != nil)
  }
  @Test @MainActor func successfulSyncAcknowledgesOfflineEdits() async throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(
      container: container,
      api: APIClient(
        baseURL: try #require(URL(string: "https://example.com")), transport: PreviewTransport()),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "test@example.invalid"))
    store.cachePaused = true
    await store.sync()
    #expect(Set(store.articles.map(\.id)) == ["sample", "folder-article"])
    store.change("sample", field: .isStarred, value: 1)
    await store.sync()
    #expect(try container.mainContext.fetchCount(FetchDescriptor<PendingChange>()) == 0)
    #expect(store.articles.first(where: { $0.id == "sample" })?.isStarred == true)
  }
}

struct BulkReadTests {
  @Test @MainActor func queuesOnlyCurrentUnreadArticlesAndKeepsOriginalVersions() async throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    for (id, feed, read) in [("a", "f", false), ("b", "f", true), ("c", "other", false)] {
      let json =
        "{\"id\":\"\(id)\",\"feedId\":\"\(feed)\",\"title\":\"Title\",\"url\":\"https://example.com\",\"isRead\":\(read),\"readVersion\":2,\"starVersion\":0,\"laterVersion\":0,\"progressVersion\":0}"
      let article = try JSONDecoder().decode(ArticleDTO.self, from: Data(json.utf8))
      container.mainContext.insert(try CachedArticle(owner: "owner", article: article))
    }
    try container.mainContext.save()
    let store = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: OfflineTransport()),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "test@example.invalid"))
    try store.reloadLocal()
    store.markFeedRead("f")
    store.markFeedRead("f")
    let pending = try container.mainContext.fetch(FetchDescriptor<PendingChange>())
    #expect(pending.count == 1)
    #expect(pending.first?.articleID == "a")
    #expect(pending.first?.version == 2)
    #expect(store.articles.first(where: { $0.id == "c" })?.isRead == false)
  }
}
