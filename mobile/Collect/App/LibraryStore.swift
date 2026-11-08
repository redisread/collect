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
  var status = ""
  var error: String?
  var conflicts: [String] = []
  var isSyncing = false
  var isCaching = false
  var cachePaused = UserDefaults.standard.bool(forKey: "offlinePaused")
  var cacheCompleted = 0
  var cacheTotal = 0
  private var cacheGeneration = 0
  var offlineRevision: Int { cacheGeneration }
  private var syncRequested = false
  var records: [String: CachedArticle] = [:]
  var cacheLimit = UserDefaults.standard.object(forKey: "offlineLimit") as? Int ?? 100
  var language = UserDefaults.standard.string(forKey: "translationLanguage") ?? "zh-CN"
  private var context: ModelContext { container.mainContext }

  init(container: ModelContainer, api: APIClient, restoreSession: Bool = true) {
    self.container = container
    self.api = api
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
      await sync()
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
    articles = values.sorted { ($0.publishedAt ?? "", $0.id) > ($1.publishedAt ?? "", $1.id) }
    if let catalog = try context.fetch(
      FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner })
    ).first {
      conflicts = catalog.notices
      feeds = try JSONDecoder().decode([FeedDTO].self, from: catalog.feeds)
      folders = try JSONDecoder().decode([FolderDTO].self, from: catalog.folders)
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
        try recordConflict("一篇文章已被删除，离线修改未应用", owner: saved.account.id)
        context.delete(item)
        try context.save()
        continue
      }
      let result = try JSONDecoder().decode(APIEnvelope<ArticleDTO>.self, from: data)
      guard code == 409 || (200..<300).contains(code), let current = result.data else {
        throw APIError(status: code, message: result.error ?? "同步失败")
      }
      if let record = records[current.id] { record.payload = try JSONEncoder().encode(current) }
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

  func sync() async {
    if isSyncing {
      syncRequested = true
      return
    }
    guard session != nil else { return }
    isSyncing = true
    defer { isSyncing = false }
    repeat {
      syncRequested = false
      guard let saved = session else { return }
      await syncOnce(saved)
    } while syncRequested && error == nil && !Task.isCancelled
  }

  private func syncOnce(_ saved: SavedSession) async {
    error = nil
    do {
      status = "同步离线修改…"
      try await flush(saved)
      guard session?.token == saved.token else { return }
      try reloadLocal()
      let newFeeds: [FeedDTO] = try await api.request("/api/feeds", token: saved.token)
      let newFolders: [FolderDTO] = try await api.request("/api/folders", token: saved.token)
      var incoming: [ArticleDTO] = []
      var cursor: String?
      repeat {
        try Task.checkCancellation()
        let query =
          cursor.map {
            "?after=\($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
          } ?? ""
        let page: ArticlePage = try await api.request(
          "/api/native/articles" + query, token: saved.token)
        incoming.append(contentsOf: page.articles)
        cursor = page.next
        status = "正在获取 \(incoming.count) 篇文章"
      } while cursor != nil
      guard session?.token == saved.token else { return }
      let owner = saved.account.id
      let ids = Set(incoming.map(\.id))
      for article in incoming {
        if let record = records[article.id] {
          if try record.decode().isRead != true && article.isRead == true { record.readAt = .now }
          record.payload = try JSONEncoder().encode(article)
        } else {
          context.insert(try CachedArticle(owner: owner, article: article))
        }
      }
      for record in records.values where !ids.contains(record.articleID) { context.delete(record) }
      if let catalog = try context.fetch(
        FetchDescriptor<CachedCatalog>(predicate: #Predicate { $0.owner == owner })
      ).first {
        catalog.feeds = try JSONEncoder().encode(newFeeds)
        catalog.folders = try JSONEncoder().encode(newFolders)
      } else {
        context.insert(
          CachedCatalog(
            owner: owner, feeds: try JSONEncoder().encode(newFeeds),
            folders: try JSONEncoder().encode(newFolders)))
      }
      try context.save()
      try reloadLocal()
      status = "同步完成 · \(incoming.count) 篇"
      await cacheArticles(saved)
    } catch is CancellationError { status = "同步已暂停" } catch {
      try? reloadLocal()
      self.error = error.localizedDescription
      status = "当前显示本地内容"
    }
  }

  func prepareArticle(_ id: String) async {
    guard let saved = session, let record = records[id], record.bodyHTML == nil else { return }
    let generation = cacheGeneration
    do {
      let body: ArticleDTO = try await api.request("/api/native/articles/\(id)", token: saved.token)
      guard session?.token == saved.token else { return }
      guard generation == cacheGeneration, records[id] === record else { return }
      record.bodyHTML = body.content ?? ""
      record.imageURLs = body.images ?? []
      record.cachedAt = .now
      try context.save()
      for image in record.imageURLs {
        BackgroundDownloads.shared.enqueue(owner: saved.account.id, source: image)
      }
    } catch { self.error = "正文暂不可用，联网后重试。\(error.localizedDescription)" }
  }

  func cacheArticles(_ saved: SavedSession) async {
    guard !isCaching, !cachePaused, session?.token == saved.token else { return }
    isCaching = true
    defer { isCaching = false }
    let protected = articles.filter { $0.isStarred == true || $0.isReadLater == true }
    let unread = articles.filter { $0.isRead != true }.prefix(max(1, cacheLimit))
    let ids = Set(protected.map(\.id) + unread.map(\.id))
    cacheTotal = ids.count
    cacheCompleted = 0
    for article in articles where ids.contains(article.id) {
      if Task.isCancelled || cachePaused || session?.token != saved.token { return }
      await prepareArticle(article.id)
      if let record = records[article.id] {
        for image in record.imageURLs {
          BackgroundDownloads.shared.enqueue(owner: saved.account.id, source: image)
        }
        if CacheFiles.isComplete(record) { cacheCompleted += 1 }
      }
    }
    do {
      let cutoff = Date.now.addingTimeInterval(-30 * 86400)
      for article in articles where !ids.contains(article.id) {
        guard let record = records[article.id] else { continue }
        if article.isRead != true || (record.readAt ?? record.cachedAt ?? .now) < cutoff {
          record.bodyHTML = nil
          record.imageURLs = []
          record.cachedAt = nil
          record.translatedHTML = nil
          record.bilingualHTML = nil
        }
      }
      try context.save()
      try removeUnusedImages()
    } catch { self.error = error.localizedDescription }
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

  func clearCache() async {
    cacheGeneration += 1
    cachePaused = true
    UserDefaults.standard.set(true, forKey: "offlinePaused")
    await BackgroundDownloads.shared.cancelAll()
    do {
      for record in records.values {
        record.bodyHTML = nil
        record.imageURLs = []
        record.cachedAt = nil
        record.translatedHTML = nil
        record.bilingualHTML = nil
      }
      try context.save()
      try removeUnusedImages()
    } catch { self.error = error.localizedDescription }
  }

  func command(_ path: String, method: String, fields: [String: String] = [:]) async throws {
    guard let saved = session else { return }
    let (data, status) = try await api.raw(
      path, method: method, token: saved.token, body: JSONEncoder().encode(fields))
    guard (200..<300).contains(status) else {
      let result = try? JSONDecoder().decode(APIEnvelope<EmptyResponse>.self, from: data)
      throw APIError(status: status, message: result?.error ?? "操作失败")
    }
    await sync()
  }
  func moveFeed(_ id: String, folder: String?) async throws {
    guard let saved = session else { return }
    let body = try JSONSerialization.data(withJSONObject: ["folderId": folder as Any? ?? NSNull()])
    let (_, status) = try await api.raw(
      "/api/feeds/\(id)", method: "PUT", token: saved.token, body: body)
    guard (200..<300).contains(status) else { throw APIError(status: status, message: "移动失败") }
    await sync()
  }
}
