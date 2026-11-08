import SwiftData
import SwiftUI
import WebKit

struct ReaderView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(LibraryStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var phase
  let articleID: String
  @State private var navigator: ReaderNavigation
  @State private var page: WebPage
  @State private var progress = 0
  @State private var hasReadingPosition = false
  @State private var mode = 0
  @State private var busy = false
  @State private var message: String?
  @State private var loaded = false
  @ScaledMetric(relativeTo: .body) private var fontSize = 19.0

  init(articleID: String) {
    self.articleID = articleID
    let navigation = ReaderNavigation()
    var configuration = WebPage.Configuration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultNavigationPreferences.allowsContentJavaScript = false
    _navigator = State(initialValue: navigation)
    _page = State(
      initialValue: WebPage(configuration: configuration, navigationDecider: navigation))
  }
  private var article: ArticleDTO? { store.articles.first { $0.id == articleID } }
  private var html: String? {
    _ = BackgroundDownloads.shared.revision
    guard let record = store.records[articleID], let original = record.bodyHTML else { return nil }
    let body: String
    switch mode {
    case 1: body = record.bilingualHTML ?? original
    case 2: body = record.translatedHTML ?? original
    default: body = original
    }
    return ReaderDocument.html(
      title: article?.title ?? "", content: CacheFiles.inlineImages(body, record: record),
      fontSize: fontSize, dark: colorScheme == .dark)
  }
  var body: some View {
    VStack(spacing: 0) {
      if let html {
        WebView(page)
          .webViewOnScrollGeometryChange(for: ReaderGeometry.self) { geometry in
            ReaderGeometry(
              offset: geometry.contentOffset.y,
              maximum: max(0, geometry.contentSize.height - geometry.containerSize.height))
          } action: { _, geometry in
            if loaded {
              progress =
                geometry.maximum > 0
                ? min(100, max(0, Int(geometry.offset / geometry.maximum * 100))) : 100
            }
          }
          .task(id: html) {
            let savedProgress = progress
            loaded = false
            do {
              for try await _ in page.load(html: html) {}
              if savedProgress > 0 {
                _ = try await page.callJavaScript(
                  "window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight) * progress / 100)",
                  arguments: ["progress": savedProgress], contentWorld: .defaultClient)
              }
              loaded = true

            } catch is CancellationError {} catch { message = error.localizedDescription }
          }
      } else {
        ContentUnavailableView("正文尚未缓存", systemImage: "doc.text", description: Text("联网后重试下载正文"))
        Button("重试") { Task { await store.prepareArticle(articleID, extract: true) } }
      }
      if let article, article.isStarred != true, article.isReadLater != true, let expiry = article.expiresAt {
        Text("预计清理日期 \(expiry.prefix(10))").font(.caption).foregroundStyle(.secondary)
      }
      if busy { ProgressView("处理中…").padding(8) }
      if let message { Text(message).font(.caption).foregroundStyle(.orange).padding(8) }
    }
    .background(Color("ReaderBackground"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .bottomBar) {
        Button("收藏", systemImage: article?.isStarred == true ? "star.fill" : "star") {
          toggle(.isStarred)
        }
        Button("稍后阅读", systemImage: article?.isReadLater == true ? "bookmark.fill" : "bookmark") {
          toggle(.isReadLater)
        }
        Menu {
          Picker("阅读视图", selection: $mode) {
            Text("原文").tag(0)
            Text("双语").tag(1)
            Text("译文").tag(2)
          }
          Button("翻译为 \(store.language)") { translate() }.disabled(busy)
          Button("提取全文") { extract() }.disabled(busy)
          Button(article?.isRead == true ? "标记未读" : "标记已读") { toggle(.isRead) }
          if let url = article.flatMap({ URL(string: $0.url) }) {
            ShareLink(item: url)
            Link("浏览器打开", destination: url)
          }
        } label: {
          Label("阅读操作", systemImage: "ellipsis.circle")
        }
      }
    }
    .task {
      progress = article?.readingProgress ?? 0
      hasReadingPosition = true
      await store.prepareArticle(articleID, extract: true)
      if store.records[articleID]?.bodyHTML != nil {
        store.change(articleID, field: .isRead, value: 1)
        await store.uploadPending()
      }
    }
    .task(id: progress) {
      do { try await Task.sleep(for: .seconds(2)) } catch { return }
      saveProgress()
    }
    .onChange(of: phase) { _, value in
      if value != .active { saveProgress() }
    }
    .onDisappear {
      saveProgress()
      Task { await store.uploadPending() }
    }
    .onChange(of: navigator.externalURL) { _, url in if let url { openURL(url) } }
  }
  private func saveProgress() {
    guard hasReadingPosition, store.records[articleID]?.bodyHTML != nil else { return }
    store.change(articleID, field: .readingProgress, value: progress)
  }
  private func toggle(_ field: ArticleField) {
    guard let article else { return }
    store.change(articleID, field: field, value: article.value(for: field) == 0 ? 1 : 0)
    Task { await store.uploadPending() }
  }
  private func translate() {
    guard let session = store.session, let record = store.records[articleID],
      let content = record.bodyHTML
    else { return }
    let language = store.language
    let cacheRevision = store.offlineRevision
    busy = true
    Task {
      defer { busy = false }
      do {
        let body = try JSONEncoder().encode([
          "articleId": articleID, "content": content, "targetLang": language,
        ])
        let result: TranslationResponse = try await store.api.request(
          "/api/translate", method: "POST", token: session.token, body: body)
        guard store.session?.token == session.token, store.records[articleID] === record,
          store.offlineRevision == cacheRevision, record.bodyHTML == content,
          store.language == language
        else { return }
        record.translatedHTML = result.translatedHtml
        record.bilingualHTML = result.bilingualHtml
        record.translationLanguage = language
        try store.container.mainContext.save()
        mode = 1
      } catch { message = error.localizedDescription }
    }
  }
  private func extract() {
    guard let session = store.session else { return }
    busy = true
    Task {
      defer { busy = false }
      do {
        let (_, status) = try await store.api.raw(
          "/api/articles/\(articleID)/extract", method: "POST", token: session.token)
        guard (200..<300).contains(status) else {
          throw APIError(status: status, message: "全文提取失败")
        }
        guard store.session?.token == session.token else { return }
        store.records[articleID]?.bodyHTML = nil
        store.records[articleID]?.translatedHTML = nil
        store.records[articleID]?.bilingualHTML = nil
        mode = 0
        await store.prepareArticle(articleID, extract: true)
      } catch { message = error.localizedDescription }
    }
  }
}
