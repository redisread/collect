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
  @State private var operation: ReaderOperation?
  @State private var showingActions = false
  @State private var message: String?
  @State private var loaded = false
  @State private var loadingArticle = true
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
      } else if loadingArticle {
        ProgressView("正在加载…").frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ContentUnavailableView("暂时无法加载", systemImage: "doc.text", description: Text("请稍后重试"))
        Button("重试") { Task { await loadArticle() } }
      }
      if let article, article.isStarred != true, article.isReadLater != true,
        let expiry = article.expiresAt
      {
        Text("预计清理日期 \(expiry.prefix(10))").font(.caption).foregroundStyle(.secondary)
      }
      if let operation { ProgressView(operation.title).padding(8) }
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
        Button("阅读操作", systemImage: "ellipsis") {
          showingActions.toggle()
        }
        .tint(showingActions ? .orange : .primary)
        .popover(isPresented: $showingActions, arrowEdge: .bottom) {
          ReaderActionsMenu(
            mode: $mode,
            url: article.flatMap { URL(string: $0.url) },
            isRead: article?.isRead == true,
            language: store.language,
            hasBody: store.records[articleID]?.bodyHTML != nil,
            hasBilingual: store.records[articleID]?.bilingualHTML != nil,
            hasTranslation: store.records[articleID]?.translatedHTML != nil,
            operation: operation,
            message: message,
            openArticle: {
              if let url = article.flatMap({ URL(string: $0.url) }) { openURL(url) }
            },
            toggleRead: { toggle(.isRead) },
            extract: extract,
            translate: translate)
        }
      }
    }
    .task {
      progress = article?.readingProgress ?? 0
      hasReadingPosition = true
      await loadArticle()
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
  private func loadArticle() async {
    loadingArticle = true
    message = nil
    defer { loadingArticle = false }
    do {
      try await store.prepareArticle(articleID, extract: true)
    } catch is CancellationError {
      return
    } catch {
      if store.records[articleID]?.bodyHTML != nil { message = "暂时无法加载全文，请稍后重试" }
    }
    guard !Task.isCancelled, store.records[articleID]?.bodyHTML != nil else { return }
    store.change(articleID, field: .isRead, value: 1)
    await store.uploadPending()
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
    guard operation == nil, let session = store.session, let record = store.records[articleID],
      let content = record.bodyHTML
    else { return }
    let language = store.language
    message = nil
    operation = .translation
    Task {
      defer { operation = nil }
      do {
        let body = try JSONEncoder().encode([
          "articleId": articleID, "content": content, "targetLang": language,
        ])
        let result: TranslationResponse = try await store.api.request(
          "/api/translate", method: "POST", token: session.token, body: body)
        guard store.session?.token == session.token, store.records[articleID] === record,
          record.bodyHTML == content,
          store.language == language
        else { return }
        record.translatedHTML = result.translatedHtml
        record.bilingualHTML = result.bilingualHtml
        record.translationLanguage = language
        try store.container.mainContext.save()
        mode = 1
        message = "翻译完成"
      } catch { message = error.localizedDescription }
    }
  }
  private func extract() {
    guard operation == nil, let session = store.session else { return }
    message = nil
    operation = .extraction
    Task {
      defer { operation = nil }
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
        try await store.prepareArticle(articleID, extract: true)
        message = "全文提取完成"
      } catch { message = error.localizedDescription }
    }
  }
}
