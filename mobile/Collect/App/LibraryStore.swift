import Foundation
import Observation
import SwiftData
import WidgetKit

@MainActor @Observable
final class LibraryStore {
  let container: ModelContainer
  let api: APIClient
  var session: SavedSession?
  var articles: [ArticleDTO] = []
  var feeds: [FeedDTO] = []
  var folders: [FolderDTO] = []
  var activeFeeds: [FeedDTO] { feeds.filter { $0.unsubscribedAt == nil } }
  var status = ""
  var error: String?
  var conflicts: [String] = []
  var isSyncing = false
  private var cacheTask: Task<Void, Never>?
  private var cacheRequested = false
  private var refreshTask: Task<Void, Never>?
  private var catalogGeneration = 0
  private var launchSession: String?
  private var uploadTask: Task<Void, Never>?
  private var uploadRequested = false
  var records: [String: CachedArticle] = [:]
  private let cacheLimit: Int
  var articleSortOrder = "desc"
  var articleRetentionDays = 30
  var language = UserDefaults.standard.string(forKey: "translationLanguage") ?? "zh-CN"
  private var context: ModelContext { container.mainContext }

  init(
    container: ModelContainer, api: APIClient, restoreSession: Bool = true,
    defaults: UserDefaults = .standard
  ) {
    self.container = container
    self.api = api
    cacheLimit = defaults.object(forKey: "offlineLimit") as? Int ?? 100
    defaults.removeObject(forKey: "offlinePaused")
    do {
      session = restoreSession ? try SessionVault.read() : nil
      try reloadLocal()
    } catch { self.error = error.localizedDescription }
  }

  func authenticate(email: String, password: String, name: String?) async {
    do {
      let result = try await api.authenticate(email: email, password: password, name: name)
      let saved = SavedSession(token: result.token, account: result.user)
      try SessionVault.save(saved)
      session = saved
      try reloadLocal()
    } catch { self.error = error.localizedDescription }
  }

  func signOut() async {
    guard let saved = session else { return }
    do {
      let (_, status) = try await api.raw(
        "/api/native/session", method: "DELETE", token: saved.token)
      guard (200..<300).contains(status) || status == 401 else {
        throw APIError(status: status, message: "退出失败，请重试")
      }
      try SessionVault.clear()
      session = nil
      articles = []
      feeds = []
      folders = []
      records = [:]
      conflicts = []
      await BackgroundDownloads.shared.cancelAll()
      try WidgetSnapshot.empty.write()
      WidgetCenter.shared.reloadAllTimelines()
    } catch { self.error = error.localizedDescription }
  }

  func reloadLocal() throws {
    guard let owner = session?.account.id else { return }
    articleRetentionDays = UserDefaults.standard.object(forKey: "retention-\(owner)") as? Int ?? 30
    let stored = try context.fetch(
      FetchDescriptor<CachedArticle>(predicate: #Predicate { $0.owner == owner }))
    let changes = try pending(owner)
    records = Dictionary(uniqueKeysWithValues: stored.map { ($0.articleID, $0) })
    var values = try stored.map { try $0.decode() }
    for index in values.indices {
      for change in changes where change.articleID == values[index].id {
        if let field = ArticleField(rawValue: change.field) {
          values[index].set(field, value: change.value)
        }
      }
    }
    articleSortOrder = "desc"
    if let catalog = try context.fetch(
      FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner })
    ).first {
      conflicts = catalog.notices
      feeds = try JSONDecoder().decode([FeedDTO].self, from: catalog.feeds)
      folders = try JSONDecoder().decode([FolderDTO].self, from: catalog.folders)
      if let data = catalog.preferences {
        let preferences = try JSONDecoder().decode(ReaderPreferences.self, from: data)
        articleRetentionDays = preferences.articleRetentionDays
        language = preferences.translationTargetLanguage
        articleSortOrder = preferences.articleSortOrder == "asc" ? "asc" : "desc"
      }
    }
    articles = values.sorted { left, right in
      let leftDate = left.publicationDate
      let rightDate = right.publicationDate
      if (leftDate == nil) != (rightDate == nil) { return leftDate != nil }
      if leftDate == rightDate {
        return articleSortOrder == "asc" ? left.id < right.id : left.id > right.id
      }
      return articleSortOrder == "asc"
        ? (leftDate ?? .distantPast) < (rightDate ?? .distantPast)
        : (leftDate ?? .distantPast) > (rightDate ?? .distantPast)
    }
    let last = stored.filter { $0.readAt != nil }.max {
      ($0.readAt ?? .distantPast) < ($1.readAt ?? .distantPast)
    }
    let lastArticle = articles.first { $0.id == last?.articleID }
    let snapshot = WidgetSnapshot(
      unread: articles.filter { $0.isRead != true }.count,
      recent: articles.prefix(4).map { .init(id: $0.id, title: $0.title) },
      continueReading: lastArticle.map { .init(id: $0.id, title: $0.title) }, updatedAt: .now)
    try snapshot.write()
    WidgetCenter.shared.reloadAllTimelines()
  }

  private func recordConflict(_ message: String, owner: String) throws {
    let catalog = try context.fetch(
      FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner })
    ).first
    catalog?.notices.append(message)
    conflicts.append(message)
  }

  func clearConflicts() {
    guard let owner = session?.account.id else { return }
    do {
      let catalog = try context.fetch(
        FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner })
      ).first
      catalog?.notices = []
      try context.save()
      conflicts = []
    } catch { self.error = error.localizedDescription }
  }

  private func pending(_ owner: String) throws -> [PendingChange] {
    try context.fetch(
      FetchDescriptor<PendingChange>(
        predicate: #Predicate { $0.owner == owner }, sortBy: [SortDescriptor(\.createdAt)]))
  }

  func change(_ id: String, field: ArticleField, value: Int) {
    guard let owner = session?.account.id, let record = records[id] else { return }
    do {
      let original = try record.decode()
      guard articles.first(where: { $0.id == id })?.value(for: field) != value else { return }
      if let existing = try pending(owner).first(where: {
        $0.articleID == id && $0.field == field.rawValue
      }) {
        existing.value = value
      } else {
        context.insert(
          PendingChange(
            owner: owner, articleID: id, field: field, value: value,
            version: original.version(for: field)))
      }
      if field == .isRead && value == 1 { record.readAt = .now }
      try context.save()
      try reloadLocal()
    } catch { self.error = error.localizedDescription }
  }

  private func flush(_ saved: SavedSession) async throws {
    for item in try pending(saved.account.id) {
      try Task.checkCancellation()
      guard session?.token == saved.token, let field = ArticleField(rawValue: item.field) else {
        return
      }
      let sentValue = item.value
      let value: Any = field == .readingProgress ? sentValue : sentValue != 0
      let body = try JSONSerialization.data(withJSONObject: [
        "field": field.rawValue, "value": value, "version": item.version,
      ])
      let (data, code) = try await api.raw(
        "/api/native/articles/\(item.articleID)", method: "PATCH", token: saved.token, body: body)
      guard session?.token == saved.token else { return }
      if code == 404 {
        try recordConflict("一篇文章已被删除，修改未同步", owner: saved.account.id)
        context.delete(item)
        if let record = records.removeValue(forKey: item.articleID) { context.delete(record) }
        try context.save()
        continue
      }
      let result = try JSONDecoder().decode(APIEnvelope<ArticleDTO>.self, from: data)
      guard code == 409 || (200..<300).contains(code), let current = result.data else {
        throw APIError(status: code, message: result.error ?? "同步失败")
      }
      try mergeArticle(current, owner: saved.account.id)
      let acknowledged = code != 409 || current.value(for: field) == sentValue
      if !acknowledged {
        try recordConflict("\(current.title) 已在其他设备修改，保留服务端状态", owner: saved.account.id)
        context.delete(item)
      } else if item.value != sentValue {
        item.version = current.version(for: field)
      } else {
        context.delete(item)
      }
      try context.save()
    }
  }

  func refreshOnLaunch() async {
    guard let token = session?.token, launchSession != token else { return }
    launchSession = token
    await refreshTask?.value
    guard session?.token == token else { return }
    await sync()
  }

  /// Upload local edits without fetching the library. Concurrent callers share the same task.
  func uploadPending() async {
    uploadRequested = true
    if let uploadTask {
      await uploadTask.value
      return
    }
    let task = Task { @MainActor in
      defer { uploadTask = nil }
      repeat {
        uploadRequested = false
        guard let saved = session else { return }
        do {
          guard !(try pending(saved.account.id)).isEmpty else { continue }
          try await flush(saved)
          guard session?.token == saved.token else { continue }
          try reloadLocal()
        } catch {
          self.error = error.localizedDescription
          return
        }
      } while uploadRequested
    }
    uploadTask = task
    await task.value
  }

  /// Called only by initial launch or the user's pull-to-refresh gesture.
  func sync() async {
    if let refreshTask {
      await refreshTask.value
      return
    }
    let task = Task { @MainActor in
      defer { refreshTask = nil }
      await refreshLibrary()
    }
    refreshTask = task
    await task.value
  }

  private func refreshLibrary() async {
    guard let saved = session else { return }
    isSyncing = true
    error = nil
    defer { isSyncing = false }
    do {
      await uploadPending()
      guard session?.token == saved.token else { return }
      let owner = saved.account.id
      let generation = catalogGeneration
      let existingCatalog = try catalog(owner)
      var cursor = existingCatalog?.syncCursor ?? 0
      let rebuilding = existingCatalog?.syncCursor == nil
      var pages: [NativeSyncPage] = []
      var count = 0
      repeat {
        try Task.checkCancellation()
        let page: NativeSyncPage = try await api.request(
          "/api/native/sync?after=\(cursor)", token: saved.token)
        guard page.cursor >= cursor, !page.hasMore || page.cursor > cursor else {
          throw APIError(status: 0, message: "同步位置无效，请重试")
        }
        pages.append(page)
        cursor = page.cursor
        count += page.articles.count
        status = "正在获取 \(count) 篇变化的文章"
        if !page.hasMore { break }
      } while true
      guard session?.token == saved.token else { return }
      guard generation == catalogGeneration else {
        status = "本地更改已保存，请下拉刷新"
        return
      }
      let unchanged = pages.allSatisfy {
        $0.articles.isEmpty && $0.feeds.isEmpty && $0.folders.isEmpty && $0.deleted.isEmpty
          && $0.preferences == nil
      }
      if unchanged, !rebuilding {
        status = "已是最新"
        cacheArticles(saved)
        return
      }
      let catalog = try existingCatalog ?? makeCatalog(owner)
      var newFeeds = rebuilding ? [] : feeds
      var newFolders = rebuilding ? [] : folders
      var retainedIDs: Set<String> = []
      for page in pages {
        for article in page.articles {
          try mergeArticle(article, owner: owner)
          retainedIDs.insert(article.id)
        }
        for feed in page.feeds {
          newFeeds.removeAll { $0.id == feed.id }
          newFeeds.append(feed)
        }
        for folder in page.folders {
          newFolders.removeAll { $0.id == folder.id }
          newFolders.append(folder)
        }
        for deletion in page.deleted {
          switch deletion.kind {
          case "article":
            retainedIDs.remove(deletion.id)
            if let record = records.removeValue(forKey: deletion.id) { context.delete(record) }
          case "feed": newFeeds.removeAll { $0.id == deletion.id }
          case "folder": newFolders.removeAll { $0.id == deletion.id }
          default: break
          }
        }
        if let preferences = page.preferences {
          catalog.preferences = try JSONEncoder().encode(preferences)
        }
      }
      if rebuilding {
        for record in records.values where !retainedIDs.contains(record.articleID) {
          context.delete(record)
        }
      }
      catalog.feeds = try JSONEncoder().encode(
        newFeeds.sorted {
          ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id)
        })
      catalog.folders = try JSONEncoder().encode(
        newFolders.sorted {
          ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id)
        })
      catalog.syncCursor = cursor
      // Cursor and data commit together, so a failed/interrupted pull can be safely replayed.
      try context.save()
      try reloadLocal()
      status = "同步完成 · \(count) 篇变化"
      cacheArticles(saved)
    } catch is CancellationError {
      context.rollback()
      try? reloadLocal()
      status = "同步已暂停"
    } catch {
      context.rollback()
      try? reloadLocal()
      self.error = error.localizedDescription
      status = "暂时无法刷新，请稍后重试"
    }
  }

  private func catalog(_ owner: String) throws -> CachedCatalog? {
    try context.fetch(FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner }))
      .first
  }

  private func makeCatalog(_ owner: String) throws -> CachedCatalog {
    let value = try CachedCatalog(
      owner: owner, feeds: JSONEncoder().encode(feeds), folders: JSONEncoder().encode(folders))
    context.insert(value)
    return value
  }

  private func mergeArticle(_ incoming: ArticleDTO, owner: String) throws {
    var article = incoming
    article.content = nil
    article.images = nil
    if let record = records[article.id] {
      let previous = try record.decode()
      var merged = article
      // A mutation receipt can arrive while a delta page is in flight.
      for field in [ArticleField.isRead, .isStarred, .isReadLater, .readingProgress] {
        if previous.version(for: field) > article.version(for: field) {
          merged.set(field, value: previous.value(for: field))
          switch field {
          case .isRead: merged.readVersion = previous.readVersion
          case .isStarred: merged.starVersion = previous.starVersion
          case .isReadLater: merged.laterVersion = previous.laterVersion
          case .readingProgress: merged.progressVersion = previous.progressVersion
          }
        }
      }
      if (article.contentVersion ?? 0) < (previous.contentVersion ?? 0) {
        merged.contentVersion = previous.contentVersion
        merged.isExtracted = previous.isExtracted
      }
      if (article.contentVersion ?? 0) > (previous.contentVersion ?? 0) {
        record.bodyHTML = nil
        record.imageURLs = []
        record.translatedHTML = nil
        record.bilingualHTML = nil
      }
      if previous.isRead != true && merged.isRead == true { record.readAt = .now }
      record.payload = try JSONEncoder().encode(merged)
    } else {
      let record = try CachedArticle(owner: owner, article: article)
      context.insert(record)
      records[article.id] = record
    }
  }

  func markFolderRead(_ folderID: String) async throws {
    guard let saved = session else { return }
    // Flush local edits before the bulk mutation so old pending unread values cannot undo it.
    await uploadPending()
    guard session?.token == saved.token else { return }
    guard try pending(saved.account.id).isEmpty else {
      throw APIError(status: 0, message: "请先同步尚未保存的修改，再重试")
    }
    let _: EmptyResponse = try await api.request(
      "/api/folders/\(folderID)/mark-all-read", method: "POST", token: saved.token)
    guard session?.token == saved.token else { return }
    await sync()
    if let error { throw APIError(status: 0, message: "已标为已读，同步失败，请重试。\(error)") }
  }

  func enableAutomaticExtraction(_ feedID: String) async throws {
    guard let saved = session else { return }
    let updated: FeedDTO = try await api.request(
      "/api/feeds/\(feedID)", method: "PUT", token: saved.token,
      body: JSONEncoder().encode(["autoExtract": true]))
    guard session?.token == saved.token else { return }
    try applyFeed(updated)
  }

  func markFeedRead(_ feedID: String) {
    guard let owner = session?.account.id else { return }
    do {
      let queued = try pending(owner).filter { $0.field == ArticleField.isRead.rawValue }
      let byArticle = Dictionary(uniqueKeysWithValues: queued.map { ($0.articleID, $0) })
      for article in articles where article.feedId == feedID && article.isRead != true {
        if let existing = byArticle[article.id] {
          existing.value = 1
        } else {
          context.insert(
            PendingChange(
              owner: owner, articleID: article.id, field: .isRead, value: 1,
              version: article.readVersion))
        }
        records[article.id]?.readAt = .now
      }
      try context.save()
      try reloadLocal()
      Task { await uploadPending() }
    } catch { self.error = error.localizedDescription }
  }

  func applyProfile(_ account: Account, token: String) throws {
    guard session?.token == token, session?.account.id == account.id else { return }
    let saved = SavedSession(token: token, account: account)
    try SessionVault.save(saved)
    session = saved
  }

  func prepareArticle(_ id: String, extract: Bool = false) async throws {
    guard let saved = session, let record = records[id] else { return }
    let shouldExtract =
      extract && (try? record.decode().isExtracted) != true
      && feeds.first(where: { $0.id == (try? record.decode().feedId) })?.autoExtract == true
    guard record.bodyHTML == nil || shouldExtract else { return }
    let body: ArticleDTO = try await api.request(
      "/api/native/articles/\(id)" + (shouldExtract ? "?extract=true" : ""), token: saved.token)
    guard session?.token == saved.token else { return }
    guard records[id] === record else { return }
    let currentVersion = try record.decode().contentVersion ?? 0
    guard (body.contentVersion ?? 0) >= currentVersion else { return }
    if record.bodyHTML != body.content {
      record.translatedHTML = nil
      record.bilingualHTML = nil
    }
    try mergeArticle(body, owner: saved.account.id)
    record.bodyHTML = body.content ?? ""
    record.imageURLs = body.images ?? []
    record.cachedAt = .now
    try context.save()
    for image in record.imageURLs {
      BackgroundDownloads.shared.enqueue(owner: saved.account.id, source: image)
    }
  }

  @discardableResult
  func cacheArticles(_ saved: SavedSession) -> Task<Void, Never>? {
    guard session?.token == saved.token else { return nil }
    cacheRequested = true
    if let cacheTask { return cacheTask }
    let task = Task { @MainActor in
      defer { cacheTask = nil }
      repeat {
        cacheRequested = false
        guard let current = session else { return }
        await prepareLibraryArticles(current)
      } while cacheRequested
    }
    cacheTask = task
    return task
  }

  func networkAvailable() async {
    await uploadPending()
    guard let saved = session else { return }
    await cacheArticles(saved)?.value
  }

  private func prepareLibraryArticles(_ saved: SavedSession) async {
    let protected = articles.filter { $0.isStarred == true || $0.isReadLater == true }
    let unread = articles.filter { $0.isRead != true }.prefix(max(1, cacheLimit))
    let ids = Set(protected.map(\.id) + unread.map(\.id))
    for article in articles where ids.contains(article.id) {
      if Task.isCancelled || session?.token != saved.token { return }
      try? await prepareArticle(article.id)
      guard !Task.isCancelled, session?.token == saved.token else { return }
    }
    do {
      let cutoff = Date.now.addingTimeInterval(-Double(articleRetentionDays) * 86400)
      for article in articles {
        guard let record = records[article.id] else { continue }
        let protected = article.isStarred == true || article.isReadLater == true
        if !protected, !ids.contains(article.id),
          article.isRead != true || (record.readAt ?? record.cachedAt ?? .now) < cutoff
        {
          record.bodyHTML = nil
          record.imageURLs = []
          record.cachedAt = nil
          record.translatedHTML = nil
          record.bilingualHTML = nil
        }
        for image in record.imageURLs {
          BackgroundDownloads.shared.enqueue(owner: saved.account.id, source: image)
        }
      }
      try context.save()
      try removeUnusedImages()
    } catch { /* Retry maintenance on the next preparation pass. */ }
  }

  private func removeUnusedImages() throws {
    let all = try context.fetch(FetchDescriptor<CachedArticle>())
    let referenced = Set(
      all.flatMap { record in record.imageURLs.map { CacheFiles.key(owner: record.owner, url: $0) }
      })
    guard FileManager.default.fileExists(atPath: CacheFiles.root.path) else { return }
    for file in try FileManager.default.contentsOfDirectory(
      at: CacheFiles.root, includingPropertiesForKeys: nil)
    where !referenced.contains(file.lastPathComponent) {
      try FileManager.default.removeItem(at: file)
    }
  }

  func applyFeed(_ feed: FeedDTO) throws {
    guard let owner = session?.account.id else { return }
    catalogGeneration += 1
    feeds.removeAll { $0.id == feed.id }
    feeds.append(feed)
    feeds.sort { ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id) }
    let value = try catalog(owner) ?? makeCatalog(owner)
    value.feeds = try JSONEncoder().encode(feeds)
    try context.save()
    try reloadLocal()
  }

  func savePreferences(_ value: ReaderPreferences) throws {
    guard let owner = session?.account.id else { return }
    catalogGeneration += 1
    let catalog = try catalog(owner) ?? makeCatalog(owner)
    catalog.preferences = try JSONEncoder().encode(value)
    try context.save()
    try reloadLocal()
  }

  func moveSubscriptions(_ ids: [String], to folderID: String?) async throws {
    guard let saved = session else { return }
    let body = try JSONSerialization.data(withJSONObject: [
      "ids": ids, "folderId": folderID as Any? ?? NSNull(),
    ])
    let response: SubscriptionBatchResponse = try await api.request(
      "/api/feeds/batch/move", method: "POST", token: saved.token, body: body)
    guard session?.token == saved.token else { return }
    try applySubscriptions(response, unsubscribed: [])
  }

  func unsubscribe(_ ids: [String]) async throws {
    guard let saved = session else { return }
    await uploadPending()
    guard session?.token == saved.token else { return }
    guard try pending(saved.account.id).isEmpty else {
      throw APIError(status: 0, message: "尚有修改未同步，请同步后再取消订阅，以保留收藏和稍后阅读")
    }
    let response: SubscriptionBatchResponse = try await api.request(
      "/api/feeds/batch/unsubscribe", method: "POST", token: saved.token,
      body: JSONEncoder().encode(["ids": ids]))
    guard session?.token == saved.token else { return }
    try applySubscriptions(response, unsubscribed: Set(ids))
  }

  private func applySubscriptions(_ response: SubscriptionBatchResponse, unsubscribed: Set<String>)
    throws
  {
    guard let owner = session?.account.id else { return }
    catalogGeneration += 1
    for feed in response.feeds {
      feeds.removeAll { $0.id == feed.id }
      feeds.append(feed)
    }
    feeds.sort { ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id) }
    let retained = Set((response.articles ?? []).map(\.id))
    for record in records.values {
      if unsubscribed.contains(try record.decode().feedId), !retained.contains(record.articleID) {
        context.delete(record)
      }
    }
    for article in response.articles ?? [] { try mergeArticle(article, owner: owner) }
    let value = try catalog(owner) ?? makeCatalog(owner)
    value.feeds = try JSONEncoder().encode(feeds)
    try context.save()
    try reloadLocal()
  }

  func reorderFolders(_ ids: [String]) async throws {
    guard let saved = session else { return }
    let result: FolderOrderResponse = try await api.request(
      "/api/folders/reorder", method: "POST", token: saved.token,
      body: JSONEncoder().encode(["ids": ids]))
    guard session?.token == saved.token else { return }
    catalogGeneration += 1
    let changes = Dictionary(uniqueKeysWithValues: result.folders.map { ($0.id, $0) })
    folders = folders.map { changes[$0.id] ?? $0 }.sorted {
      ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id)
    }
    let value = try catalog(saved.account.id) ?? makeCatalog(saved.account.id)
    value.folders = try JSONEncoder().encode(folders)
    try context.save()
    try reloadLocal()
  }

  func command(_ path: String, method: String, fields: [String: String] = [:]) async throws {
    if method == "DELETE", path.hasPrefix("/api/feeds/") {
      try await unsubscribe([String(path.split(separator: "/").last!)])
      return
    }
    guard let saved = session else { return }
    let (data, status) = try await api.raw(
      path, method: method, token: saved.token, body: JSONEncoder().encode(fields))
    guard session?.token == saved.token else { return }
    guard (200..<300).contains(status) else {
      let result = try? JSONDecoder().decode(APIEnvelope<EmptyResponse>.self, from: data)
      throw APIError(status: status, message: result?.error ?? "操作失败")
    }
    catalogGeneration += 1
    let id = path.split(separator: "/").last.map(String.init) ?? ""
    if path.hasPrefix("/api/feeds") {
      do {
        let result = try JSONDecoder().decode(APIEnvelope<FeedDTO>.self, from: data)
        if let feed = result.data {
          try applyFeed(feed)
          // A newly added feed loads only its own article metadata.
          do {
            var after: String?
            repeat {
              var query = URLComponents()
              query.queryItems = [URLQueryItem(name: "feedId", value: feed.id)]
              if let after { query.queryItems?.append(URLQueryItem(name: "after", value: after)) }
              let page: ArticlePage = try await api.request(
                "/api/native/articles?" + (query.percentEncodedQuery ?? ""), token: saved.token)
              guard session?.token == saved.token else { return }
              for article in page.articles { try mergeArticle(article, owner: saved.account.id) }
              after = page.next
            } while after != nil
          } catch {
            self.error = "订阅已添加，请下拉刷新获取文章"
          }
        }
      }
    } else if path.hasPrefix("/api/folders") {
      if method == "DELETE" {
        folders.removeAll { $0.id == id }
        for index in feeds.indices where feeds[index].folderId == id { feeds[index].folderId = nil }
      } else {
        let result = try JSONDecoder().decode(APIEnvelope<FolderDTO>.self, from: data)
        if let folder = result.data {
          folders.removeAll { $0.id == folder.id }
          folders.append(folder)
        }
      }
    }
    feeds.sort { ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id) }
    folders.sort { ($0.sortOrder ?? 0, $0.id) < ($1.sortOrder ?? 0, $1.id) }
    let value = try catalog(saved.account.id) ?? makeCatalog(saved.account.id)
    value.feeds = try JSONEncoder().encode(feeds)
    value.folders = try JSONEncoder().encode(folders)
    try context.save()
    try reloadLocal()
    if method == "POST", path == "/api/feeds" { cacheArticles(saved) }
  }
}
