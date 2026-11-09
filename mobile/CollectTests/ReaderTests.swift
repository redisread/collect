import Foundation
import SwiftData
import Testing

@testable import Collect

struct ReaderTests {
  @Test func widgetContainerIsAvailable() throws {
    _ = try #require(WidgetSnapshot.fileURL)
  }
  @Test func escapesArticleTitles() {
    #expect(ReaderDocument.escape("<script>&") == "&lt;script&gt;&amp;")
  }
  @Test func cacheKeysAreAccountScoped() {
    #expect(
      CacheFiles.key(owner: "a", url: "https://a.test/i")
        != CacheFiles.key(owner: "b", url: "https://a.test/i"))
  }
  @Test @MainActor func offlineChangesSurvivePersistence() throws {
    let schema = Schema(versionedSchema: CollectSchema.self)
    let container = try ModelContainer(
      for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let context = container.mainContext
    context.insert(PendingChange(owner: "a", articleID: "x", field: .isRead, value: 1, version: 7))
    try context.save()
    let stored = try #require(context.fetch(FetchDescriptor<PendingChange>()).first)
    #expect(stored.owner == "a")
    #expect(stored.version == 7)
    #expect(stored.value == 1)
  }
}

struct AppearanceTests {
  @Test func lightReaderUsesLightColorScheme() {
    let html = ReaderDocument.html(
      title: "Title", content: "<p>Body</p>", fontSize: 19, dark: false)
    #expect(html.contains("color-scheme:light"))
    #expect(html.contains("background:#fff;color:#222"))
  }
}

struct PublicationTests {
  @Test func supportsFractionalTimestampsAndRejectsMissingDates() throws {
    let payload = "{\"id\":\"a\",\"feedId\":\"f\",\"title\":\"A\",\"url\":\"https://example.com\",\"readVersion\":0,\"starVersion\":0,\"laterVersion\":0,\"progressVersion\":0}"
    var article = try JSONDecoder().decode(ArticleDTO.self, from: Data(payload.utf8))
    #expect(article.publicationDate == nil)
    article.publishedAt = "invalid"
    #expect(article.publicationDate == nil)
    article.publishedAt = "2026-11-08T10:00:00.123Z"
    #expect(article.publicationDate != nil)
    article.publishedAt = "2026-11-08T10:00:00Z"
    #expect(article.publicationDate != nil)
  }

  @Test @MainActor func persistsOrderAndKeepsUnknownDatesLast() async throws {
    let container = try ModelContainer(for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(container: container,
      api: APIClient(baseURL: try #require(URL(string: "https://example.com")), transport: PreviewTransport()),
      restoreSession: false)
    store.session = SavedSession(token: "test", account: Account(id: "owner", name: "Owner", email: "test@example.invalid"))
    await store.sync()
    #expect(store.articles.map(\.id) == ["sample", "folder-article"])
    try store.savePreferences(ReaderPreferences(articleRetentionDays: 30, translationTargetLanguage: "zh-CN", articleSortOrder: "asc"))
    #expect(store.articles.map(\.id) == ["folder-article", "sample"])
    try store.reloadLocal()
    #expect(store.articleSortOrder == "asc")
    let old = try JSONDecoder().decode(ReaderPreferences.self,
      from: Data("{\"articleRetentionDays\":30,\"translationTargetLanguage\":\"zh-CN\"}".utf8))
    #expect(old.articleSortOrder == nil)
  }

  @Test @MainActor func automaticExtractionPersistsInCatalog() async throws {
    let container = try ModelContainer(for: Schema(versionedSchema: CollectSchema.self),
      configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(container: container,
      api: APIClient(baseURL: try #require(URL(string: "https://example.com")), transport: PreviewTransport()),
      restoreSession: false)
    store.session = SavedSession(token: "test", account: Account(id: "owner", name: "Owner", email: "test@example.invalid"))
    await store.sync()
    try await store.enableAutomaticExtraction("feed")
    try store.reloadLocal()
    #expect(store.feeds.first { $0.id == "feed" }?.autoExtract == true)
    #expect(store.feeds.first { $0.id == "folder-feed" }?.autoExtract != true)
    try await store.markFolderRead("test-folder")
    #expect(store.articles.first { $0.id == "sample" }?.isRead != true)
  }
}
