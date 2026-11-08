import Foundation
import SwiftData
import Testing

@testable import Collect

struct SubscriptionManagementTests {
  @Test @MainActor func unsubscribeUploadsProtectionAndKeepsSavedBody() async throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: PreviewTransport()),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "owner@example.invalid"))
    store.cachePaused = true
    await store.sync()
    await store.prepareArticle("sample")
    let body = store.records["sample"]?.bodyHTML
    store.change("sample", field: .isStarred, value: 1)
    try await store.unsubscribe(["feed"])
    #expect(store.activeFeeds.map(\.id) == ["folder-feed"])
    #expect(store.articles.first(where: { $0.id == "sample" })?.isStarred == true)
    #expect(store.records["sample"]?.bodyHTML == body)
    #expect(store.feeds.first(where: { $0.id == "feed" })?.title == "阅读笔记")
    try await store.unsubscribe(["folder-feed"])
    #expect(store.records["folder-article"] == nil)
    #expect(store.activeFeeds.isEmpty)
    #expect(try container.mainContext.fetchCount(FetchDescriptor<PendingChange>()) == 0)
  }

  @Test @MainActor func failedOfflineUploadPreventsUnsubscribe() async throws {
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let initial = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: PreviewTransport()),
      restoreSession: false)
    let session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "owner@example.invalid"))
    initial.session = session
    initial.cachePaused = true
    await initial.sync()
    initial.change("sample", field: .isStarred, value: 1)
    let offline = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: OfflineTransport()),
      restoreSession: false)
    offline.session = session
    try offline.reloadLocal()
    await #expect(throws: APIError.self) { try await offline.unsubscribe(["feed"]) }
    #expect(offline.activeFeeds.count == 2)
    #expect(offline.articles.first(where: { $0.id == "sample" })?.isStarred == true)
    #expect(try container.mainContext.fetchCount(FetchDescriptor<PendingChange>()) == 1)
  }

  @Test @MainActor func movesAndOrdersWithoutLibraryRefresh() async throws {
    let transport = CountingTransport()
    let container = try ModelContainer(
      for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: transport),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "owner@example.invalid"))
    store.cachePaused = true
    await store.sync()
    try await store.moveSubscriptions(["feed"], to: "test-folder")
    #expect(store.feeds.first(where: { $0.id == "feed" })?.folderId == "test-folder")
    try await store.command("/api/folders", method: "POST", fields: ["name": "New"])
    try await store.reorderFolders(["new-folder-1", "test-folder"])
    #expect(store.folders.map(\.name) == ["New", "测试目录"])
    try await store.command("/api/folders/test-folder", method: "DELETE")
    #expect(store.feeds.allSatisfy { $0.folderId == nil })
    #expect(store.articles.count == 2)
    #expect(await transport.calls().filter { $0.contains("/api/native/sync") }.count == 1)
  }
}
