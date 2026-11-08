import Foundation
import SwiftData
import Testing

@testable import Collect

actor CountingTransport: HTTPTransport {
  let preview = PreviewTransport()
  private var requests: [String] = []
  func send(_ request: URLRequest) async throws -> (Data, Int) {
    requests.append(
      "\(request.httpMethod ?? "GET") \(request.url!.path)?\(request.url!.query ?? "")")
    return try await preview.send(request)
  }
  func calls() -> [String] { requests }
}

actor PagedSyncTransport: HTTPTransport {
  var failSecondPage = true
  func allowCompletion() { failSecondPage = false }
  func send(_ request: URLRequest) async throws -> (Data, Int) {
    let after = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?
      .value
    if after == "1", failSecondPage { throw URLError(.networkConnectionLost) }
    let data: [String: Any] =
      after == "0"
      ? [
        "cursor": 1, "hasMore": true,
        "articles": [
          [
            "id": "new", "feedId": "feed", "title": "New", "url": "https://example.com/new",
            "readVersion": 0, "starVersion": 0, "laterVersion": 0, "progressVersion": 0,
          ]
        ],
        "feeds": [], "folders": [], "deleted": [],
      ]
      : [
        "cursor": 2, "hasMore": false, "articles": [], "feeds": [], "folders": [],
        "deleted": [["kind": "article", "id": "new"]],
      ]
    return (try JSONSerialization.data(withJSONObject: ["success": true, "data": data]), 200)
  }
}

struct IncrementalSyncTests {
  @MainActor private func makeStore(
    _ transport: any HTTPTransport, container: ModelContainer? = nil
  ) throws -> LibraryStore {
    let container =
      try container
      ?? ModelContainer(
        for: Schema(versionedSchema: CollectSchema.self),
        configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let store = LibraryStore(
      container: container,
      api: APIClient(baseURL: URL(string: "https://example.com")!, transport: transport),
      restoreSession: false)
    store.session = SavedSession(
      token: "test", account: Account(id: "owner", name: "Owner", email: "owner@example.invalid"))
    store.cachePaused = true
    return store
  }

  @Test @MainActor func launchRefreshesOnceAndEditsOnlyUpload() async throws {
    let transport = CountingTransport()
    let store = try makeStore(transport)
    await store.refreshOnLaunch()
    await store.refreshOnLaunch()
    await store.uploadPending()  // Reconnection with no queued changes performs no request.
    #expect(await transport.calls() == ["GET /api/native/sync?after=0"])
    store.change("sample", field: .isRead, value: 1)
    await store.uploadPending()
    #expect(
      await transport.calls() == [
        "GET /api/native/sync?after=0", "PATCH /api/native/articles/sample?",
      ])
    #expect(store.articles.first(where: { $0.id == "sample" })?.isRead == true)
    store.change("sample", field: .isRead, value: 1)
    await store.uploadPending()
    #expect(await transport.calls().count == 2)
    await store.sync()  // Explicit pull-to-refresh.
    #expect(await transport.calls().last == "GET /api/native/sync?after=1")
    let restarted = try makeStore(transport, container: store.container)
    try restarted.reloadLocal()
    await restarted.refreshOnLaunch()
    #expect(await transport.calls().last == "GET /api/native/sync?after=2")
    #expect(restarted.articles.count == 2)
  }

  @Test @MainActor func failedPageDoesNotAdvanceCursorAndDeletionReplaysSafely() async throws {
    let transport = PagedSyncTransport()
    let store = try makeStore(transport)
    await store.sync()
    #expect(store.error != nil)
    #expect(store.articles.isEmpty)
    #expect(try store.container.mainContext.fetch(FetchDescriptor<CachedCatalog>()).isEmpty)
    await transport.allowCompletion()
    await store.sync()
    #expect(store.error == nil)
    #expect(store.articles.isEmpty)
    #expect(
      try store.container.mainContext.fetch(FetchDescriptor<CachedCatalog>()).first?.syncCursor == 2
    )
    #expect(try store.container.mainContext.fetch(FetchDescriptor<CachedArticle>()).isEmpty)
  }
}

actor PausingSyncTransport: HTTPTransport {
  private var started = false
  private var waiting: CheckedContinuation<Void, Never>?
  private var release: CheckedContinuation<Void, Never>?
  private var tokens: [String] = []
  func waitForStart() async {
    if started { return }
    await withCheckedContinuation { waiting = $0 }
  }
  func resume() {
    release?.resume()
    release = nil
  }
  func sentTokens() -> [String] { tokens }
  func send(_ request: URLRequest) async throws -> (Data, Int) {
    tokens.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
    if !started {
      started = true
      waiting?.resume()
      waiting = nil
      await withCheckedContinuation { release = $0 }
    }
    return (
      Data(
        "{\"success\":true,\"data\":{\"cursor\":0,\"hasMore\":false,\"articles\":[],\"feeds\":[],\"folders\":[],\"deleted\":[]}}"
          .utf8), 200
    )
  }
}

extension IncrementalSyncTests {
  @Test @MainActor func accountSwitchWaitsForOldPullThenLoadsNewAccount() async throws {
    let transport = PausingSyncTransport()
    let store = try makeStore(transport)
    let oldPull = Task { await store.refreshOnLaunch() }
    await transport.waitForStart()
    store.session = SavedSession(
      token: "new", account: Account(id: "new-owner", name: "New", email: "new@example.invalid"))
    try store.reloadLocal()
    let newPull = Task { await store.refreshOnLaunch() }
    await transport.resume()
    await oldPull.value
    await newPull.value
    #expect(await transport.sentTokens() == ["Bearer test", "Bearer new"])
    let catalogs = try store.container.mainContext.fetch(FetchDescriptor<CachedCatalog>())
    #expect(catalogs.map(\.owner) == ["new-owner"])
  }
}

actor BodyRaceTransport: HTTPTransport {
  private var bodyStarted = false
  private var waiter: CheckedContinuation<Void, Never>?
  private var release: CheckedContinuation<Void, Never>?
  func waitForBody() async {
    if bodyStarted { return }
    await withCheckedContinuation { waiter = $0 }
  }
  func resumeBody() {
    release?.resume()
    release = nil
  }
  private func article(version: Int) -> [String: Any] {
    [
      "id": "a", "feedId": "f", "title": "Article", "url": "https://example.com/a",
      "readVersion": 0,
      "starVersion": 0, "laterVersion": 0, "progressVersion": 0, "contentVersion": version,
      "isExtracted": true, "content": "<p>Version \(version)</p>",
    ]
  }
  func send(_ request: URLRequest) async throws -> (Data, Int) {
    let data: [String: Any]
    if request.url!.path == "/api/native/sync" {
      let version = request.url!.query == "after=0" ? 1 : 2
      data = [
        "cursor": version, "hasMore": false, "articles": [article(version: version)], "feeds": [],
        "folders": [], "deleted": [],
      ]
    } else {
      let version = bodyStarted ? 2 : 1
      if !bodyStarted {
        bodyStarted = true
        waiter?.resume()
        waiter = nil
        await withCheckedContinuation { release = $0 }
      }
      data = article(version: version)
    }
    return (try JSONSerialization.data(withJSONObject: ["success": true, "data": data]), 200)
  }
}

extension IncrementalSyncTests {
  @Test @MainActor func delayedOldBodyCannotOverwriteNewContentVersion() async throws {
    let transport = BodyRaceTransport()
    let store = try makeStore(transport)
    await store.sync()
    let oldBody = Task { await store.prepareArticle("a") }
    await transport.waitForBody()
    await store.sync()
    #expect(try store.records["a"]?.decode().contentVersion == 2)
    await transport.resumeBody()
    await oldBody.value
    #expect(store.records["a"]?.bodyHTML == nil)
    await store.prepareArticle("a")
    #expect(store.records["a"]?.bodyHTML == "<p>Version 2</p>")
  }
}
