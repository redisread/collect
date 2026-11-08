import SwiftUI

struct LibraryView: View {
  @Environment(LibraryStore.self) private var store
  @State private var showAdd = false
  @State private var path: [ArticleScope] = []
  @State private var expandedFolders: Set<ArticleScope> = []
  @State private var deepLinkArticle: String?
  @State private var managedFolderID: String?

  var body: some View {
    NavigationStack(path: $path) {
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
        Section {
          ForEach(store.folders) { folder in
            folderRow(folder.name, folderID: folder.id, scope: .folder(folder.id))
              .contextMenu {
                Button("管理文件夹") { managedFolderID = folder.id }
              }
            if expandedFolders.contains(.folder(folder.id)) {
              ForEach(store.activeFeeds.filter { $0.folderId == folder.id }) {
                feedRow($0).padding(.leading, 28)
              }
            }
          }
          folderRow("未分类", folderID: nil, scope: .unfiled)
          if expandedFolders.contains(.unfiled) {
            ForEach(store.activeFeeds.filter { $0.folderId == nil }) {
              feedRow($0).padding(.leading, 28)
            }
          }
        } header: {
          HStack {
            Text("订阅")
            Spacer()
            NavigationLink("管理") { SubscriptionManagementView() }
              .accessibilityIdentifier("manage-subscriptions")
          }
        }
        Section {
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
        ToolbarItem(placement: .topBarLeading) {
          NavigationLink {
            SettingsView()
          } label: {
            Image(systemName: "gearshape")
          }
          .accessibilityLabel("设置")
          .accessibilityIdentifier("settings-button")
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button("添加订阅", systemImage: "plus") { showAdd = true }
        }
      }
      .refreshable { await store.sync() }
      .navigationDestination(for: ArticleScope.self) { ArticleListView(scope: $0) }
      .navigationDestination(item: $managedFolderID) { id in
        if let folder = store.folders.first(where: { $0.id == id }) {
          FolderEditor(folder: folder)
        }
      }
      .navigationDestination(item: $deepLinkArticle) { ReaderView(articleID: $0) }
      .sheet(isPresented: $showAdd) { AddSubscriptionView() }
      .onOpenURL { url in
        guard url.scheme == "collect", url.host == "article" else { return }
        let id = url.lastPathComponent
        if store.records[id] != nil { deepLinkArticle = id }
      }
    }
  }
  private func folderRow(_ name: String, folderID: String?, scope: ArticleScope) -> some View {
    let expanded = expandedFolders.contains(scope)
    let identifier = folderID.map { "folder-\($0)" } ?? "unclassified-folder"
    return HStack(spacing: 0) {
      Button {
        path.append(scope)
      } label: {
        HStack {
          Label(name, systemImage: "folder")
          Spacer()
          Text(unread(folder: folderID), format: .number).foregroundStyle(.secondary)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier(identifier)
      .accessibilityHint("查看目录中的文章")
      Button {
        if expanded {
          expandedFolders.remove(scope)
        } else {
          expandedFolders.insert(scope)
        }
      } label: {
        Image(systemName: expanded ? "chevron.down" : "chevron.right")
          .font(.footnote.weight(.semibold))
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("\(expanded ? "收起" : "展开")\(name)订阅源")
      .accessibilityValue(expanded ? "已展开" : "已收起")
      .accessibilityIdentifier("\(identifier)-expand")
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
    let ids = Set(store.activeFeeds.filter { $0.folderId == folder }.map(\.id))
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
