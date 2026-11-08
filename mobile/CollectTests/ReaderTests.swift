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
        #expect(CacheFiles.key(owner: "a", url: "https://a.test/i") != CacheFiles.key(owner: "b", url: "https://a.test/i"))
    }
    @Test @MainActor func offlineChangesSurvivePersistence() throws {
        let schema = Schema(versionedSchema: CollectSchema.self)
        let container = try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = container.mainContext
        context.insert(PendingChange(owner: "a", articleID: "x", field: .isRead, value: 1, version: 7))
        try context.save()
        let stored = try #require(context.fetch(FetchDescriptor<PendingChange>()).first)
        #expect(stored.owner == "a")
        #expect(stored.version == 7)
        #expect(stored.value == 1)
    }
}
