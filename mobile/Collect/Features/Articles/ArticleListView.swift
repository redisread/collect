import SwiftUI

struct ArticleListView: View {
  @Environment(LibraryStore.self) private var store
  let scope: ArticleScope
  @State private var search = ""
  @State private var hideRead = false
  @State private var scrollID: String?
  @State private var restored = false
  private var positionKey: String {
    "list-position-\(store.session?.account.id ?? "")-\(String(reflecting: scope))"
  }
  private var rows: [ArticleDTO] {
    _ = BackgroundDownloads.shared.revision
    return store.articles.filter { article in
      let matches: Bool
      switch scope {
      case .all: matches = true
      case .unread: matches = article.isRead != true
      case .starred: matches = article.isStarred == true
      case .later: matches = article.isReadLater == true
      case .unfiled:
        matches = store.activeFeeds.contains { $0.id == article.feedId && $0.folderId == nil }
      case .feed(let id): matches = article.feedId == id
      case .folder(let id):
        matches = store.activeFeeds.contains { $0.id == article.feedId && $0.folderId == id }
      }
      return matches && (!hideRead || article.isRead != true)
        && (search.isEmpty || article.title.localizedStandardContains(search)
          || (article.summary?.localizedStandardContains(search) ?? false)
          || (store.records[article.id]?.bodyHTML?.localizedStandardContains(search) ?? false))
    }
  }
  private var title: String {
    switch scope {
    case .feed(let id): store.feeds.first { $0.id == id }?.title ?? "订阅"
    case .folder(let id): store.folders.first { $0.id == id }?.name ?? "文件夹"
    default: scope.title
    }
  }
  var body: some View {
    ScrollViewReader { proxy in
      List {
        ForEach(rows) { article in
          NavigationLink {
            ReaderView(articleID: article.id)
          } label: {
            VStack(alignment: .leading, spacing: 8) {
              HStack {
                Text(store.feeds.first { $0.id == article.feedId }?.title ?? "订阅").font(.caption)
                  .foregroundStyle(.secondary)
                Spacer()
                if let record = store.records[article.id], record.bodyHTML != nil {
                  Image(
                    systemName: CacheFiles.isComplete(record)
                      ? "arrow.down.circle.fill" : "arrow.down.circle"
                  )
                  .foregroundStyle(.secondary)
                  .accessibilityLabel(CacheFiles.isComplete(record) ? "正文和图片已缓存" : "图片待下载")
                }
                if article.isRead != true {
                  Circle().fill(.orange).frame(width: 6, height: 6).accessibilityLabel("未读")
                }
              }
              Text(article.title).font(.headline).foregroundStyle(
                article.isRead == true ? .secondary : .primary
              ).lineLimit(3)
              if let summary = article.summary, !summary.isEmpty {
                Text(
                  summary.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                ).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
              }
            }.padding(.vertical, 8)
          }
          .id(article.id)
          .background {
            GeometryReader { geometry in
              Color.clear.preference(
                key: VisibleRowPreference.self,
                value: [article.id: geometry.frame(in: .named("article-list")).minY])
            }
          }
          .swipeActions(edge: .leading) {
            Button(article.isRead == true ? "标记未读" : "标记已读", systemImage: "checkmark") {
              store.change(article.id, field: .isRead, value: article.isRead == true ? 0 : 1)
              Task { await store.uploadPending() }
            }.tint(.orange)
          }
          .swipeActions(edge: .trailing) {
            Button("稍后阅读", systemImage: "bookmark") {
              store.change(
                article.id, field: .isReadLater, value: article.isReadLater == true ? 0 : 1)
              Task { await store.uploadPending() }
            }.tint(.blue)
            Button("收藏", systemImage: "star") {
              store.change(article.id, field: .isStarred, value: article.isStarred == true ? 0 : 1)
              Task { await store.uploadPending() }
            }.tint(.yellow)
          }
        }
      }
      .coordinateSpace(name: "article-list")
      .onPreferenceChange(VisibleRowPreference.self) { positions in
        scrollID = positions.filter { $0.value >= 0 }.min { $0.value < $1.value }?.key
      }
      .task(id: rows.first?.id) {
        guard !restored, !rows.isEmpty else { return }
        restored = true
        if let id = UserDefaults.standard.string(forKey: positionKey) {
          proxy.scrollTo(id, anchor: .top)
        }
      }
      .onDisappear { if let scrollID { UserDefaults.standard.set(scrollID, forKey: positionKey) } }
      .scrollContentBackground(.hidden).background(Color("ReaderBackground"))
      .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
      .searchable(text: $search, prompt: "搜索已同步的文章")
      .toolbar {
        if case .feed(let id) = scope { Button("全部标为已读") { store.markFeedRead(id) } }
        Toggle("隐藏已读", systemImage: "line.3.horizontal.decrease", isOn: $hideRead)
      }
      .overlay {
        if rows.isEmpty {
          ContentUnavailableView("暂无文章", systemImage: "tray", description: Text("同步订阅或调整筛选后继续阅读"))
        }
      }
      .refreshable { await store.sync() }
    }
  }
}
