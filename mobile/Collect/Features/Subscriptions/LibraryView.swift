import SwiftUI

struct LibraryView: View {
  @Environment(LibraryStore.self) private var store
  @State private var showAdd = false
  @State private var deepLinkArticle: String?

  var body: some View {
    NavigationStack {
      List {
        Section {
          destination("全部文章", icon: "tray", scope: .all, count: store.articles.count)
          destination(
            "未读", icon: "circle", scope: .unread,
            count: store.articles.filter { $0.isRead != true }.count)
          destination(
            "收藏", icon: "star", scope: .starred,
            count: store.articles.filter { $0.isStarred == true }.count)
          destination(
            "稍后阅读", icon: "bookmark", scope: .later,
            count: store.articles.filter { $0.isReadLater == true }.count)
        }
        Section("订阅") {
          ForEach(store.folders) { folder in
            DisclosureGroup {
              NavigationLink("查看文件夹文章", value: ArticleScope.folder(folder.id))
              ForEach(store.feeds.filter { $0.folderId == folder.id }) { feedRow($0) }
            } label: {
              HStack {
                Label(folder.name, systemImage: "folder")
                Spacer()
                Text(unread(folder: folder.id), format: .number).foregroundStyle(.secondary)
              }
            }
            .contextMenu {
              NavigationLink("管理文件夹") { FolderEditor(folder: folder) }
            }
          }
          DisclosureGroup {
            NavigationLink("查看未分类文章", value: ArticleScope.unfiled)
            ForEach(store.feeds.filter { $0.folderId == nil }) { feedRow($0) }
          } label: {
            HStack {
              Label("未分类", systemImage: "folder")
              Spacer()
              Text(unread(folder: nil), format: .number).foregroundStyle(.secondary)
            }
          }
          .accessibilityIdentifier("unclassified-folder")
        }
        Section {
          NavigationLink {
            OfflineView()
          } label: {
            Label("离线阅读", systemImage: "arrow.down.circle")
          }
          NavigationLink {
            SettingsView()
          } label: {
            Label("设置", systemImage: "gearshape")
          }
          if !store.status.isEmpty { Text(store.status).font(.caption).foregroundStyle(.secondary) }
          if let error = store.error { Text(error).font(.caption).foregroundStyle(.red) }
          ForEach(Array(store.conflicts.enumerated()), id: \.offset) { _, text in
            Text(text).font(.caption).foregroundStyle(.orange)
          }
          if !store.conflicts.isEmpty { Button("清除同步提示") { store.clearConflicts() } }
        }
      }
      .scrollContentBackground(.hidden).background(Color("ReaderBackground"))
      .navigationTitle("Collect")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("添加订阅", systemImage: "plus") { showAdd = true }
        }
      }
      .refreshable { await store.sync() }
      .navigationDestination(for: ArticleScope.self) { ArticleListView(scope: $0) }
      .navigationDestination(item: $deepLinkArticle) { ReaderView(articleID: $0) }
      .sheet(isPresented: $showAdd) { AddSubscriptionView() }
      .onOpenURL { url in
        guard url.scheme == "collect", url.host == "article" else { return }
        let id = url.lastPathComponent
        if store.records[id] != nil { deepLinkArticle = id }
      }
    }
  }
  private func destination(_ name: String, icon: String, scope: ArticleScope, count: Int)
    -> some View
  {
    NavigationLink(value: scope) {
      HStack {
        Label(name, systemImage: icon)
        Spacer()
        Text(count, format: .number).foregroundStyle(.secondary)
      }
    }
  }
  private func unread(folder: String?) -> Int {
    let ids = Set(store.feeds.filter { $0.folderId == folder }.map(\.id))
    return store.articles.filter { ids.contains($0.feedId) && $0.isRead != true }.count
  }
  private func feedRow(_ feed: FeedDTO) -> some View {
    NavigationLink(value: ArticleScope.feed(feed.id)) {
      HStack {
        Text(feed.title).lineLimit(2)
        Spacer()
        Text(
          store.articles.filter { $0.feedId == feed.id && $0.isRead != true }.count, format: .number
        )
        .foregroundStyle(.secondary)
      }
    }.contextMenu {
      NavigationLink("移动到文件夹") { FeedEditor(feed: feed) }
      NavigationLink("管理订阅") { FeedEditor(feed: feed) }
      Button("全部标为已读") { store.markFeedRead(feed.id) }
    }
  }
}
