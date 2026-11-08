import SwiftUI

struct SubscriptionManagementView: View {
  @Environment(LibraryStore.self) private var store
  @State private var search = ""
  @State private var selection: Set<String> = []
  @State private var editMode: EditMode = .inactive
  @State private var adding = false
  @State private var confirming = false
  @State private var busy = false
  @State private var message: String?

  private var matches: [FeedDTO] {
    store.activeFeeds.filter {
      search.isEmpty || $0.title.localizedStandardContains(search)
        || $0.feedUrl.localizedStandardContains(search)
    }
  }

  var body: some View {
    managementList
      .environment(\.editMode, $editMode)
      .disabled(busy)
      .scrollContentBackground(.hidden)
      .background(Color("ReaderBackground"))
      .navigationTitle("管理订阅")
      .searchable(
        text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "搜索名称或订阅地址"
      )
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("添加订阅", systemImage: "plus") { adding = true }
            .accessibilityIdentifier("open-add-subscription")
            .disabled(busy)
        }
        ToolbarItemGroup(placement: .bottomBar) {
          Button(editMode == .active ? "完成" : "选择") {
            editMode = editMode == .active ? .inactive : .active
            selection.removeAll()
          }.disabled(busy)
          Spacer()
          if editMode == .active {
            Text("已选 \(selection.count) 项").font(.caption)
            Menu("移动", systemImage: "folder") {
              Button("未分类") { move(to: nil) }
              ForEach(store.folders) { folder in Button(folder.name) { move(to: folder.id) } }
            }.disabled(selection.isEmpty || busy)
            Button("取消订阅", role: .destructive) { confirming = true }
              .disabled(selection.isEmpty || busy)
          }
        }
      }
      .sheet(isPresented: $adding) { AddSubscriptionView() }
      .confirmationDialog(
        "取消 \(selection.count) 个订阅并清理普通文章？收藏和稍后阅读会保留。", isPresented: $confirming,
        titleVisibility: .visible
      ) {
        Button("确认取消订阅", role: .destructive) { perform { try await store.unsubscribe($0) } }
      }
      .onChange(of: store.activeFeeds.map(\.id)) { _, ids in selection.formIntersection(ids) }
      .refreshable { await store.sync() }
  }

  private var managementList: some View {
    List(selection: $selection) {
      if editMode == .inactive {
        NavigationLink {
          FolderManagementView()
        } label: {
          Label("管理文件夹", systemImage: "folder")
        }
      }
      ForEach(store.folders) { folder in
        let feeds = matches.filter { $0.folderId == folder.id }
        if search.isEmpty || !feeds.isEmpty {
          Section(folder.name) { ForEach(feeds) { feedRow($0) } }
        }
      }
      let unfiled = matches.filter { $0.folderId == nil }
      if search.isEmpty || !unfiled.isEmpty {
        Section("未分类") { ForEach(unfiled) { feedRow($0) } }
      }
      if matches.isEmpty {
        Text(search.isEmpty ? "还没有订阅源" : "没有匹配的订阅源").foregroundStyle(.secondary)
      }
      if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
    }
  }

  @ViewBuilder private func feedRow(_ feed: FeedDTO) -> some View {
    if editMode == .active {
      rowLabel(feed).tag(feed.id)
    } else {
      NavigationLink {
        FeedEditor(feed: feed)
      } label: {
        rowLabel(feed)
      }
    }
  }

  private func rowLabel(_ feed: FeedDTO) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(feed.title)
      Text(feed.feedUrl).font(.caption).foregroundStyle(.secondary).lineLimit(1)
    }
  }

  private func move(to folder: String?) {
    perform { try await store.moveSubscriptions($0, to: folder) }
  }

  private func perform(_ operation: @escaping @MainActor ([String]) async throws -> Void) {
    let ids = selection.sorted()
    busy = true
    message = nil
    Task {
      defer { busy = false }
      var completed = 0
      do {
        for offset in stride(from: 0, to: ids.count, by: 50) {
          let batch = Array(ids[offset..<min(offset + 50, ids.count)])
          try await operation(batch)
          selection.subtract(batch)
          completed += batch.count
          message = "已完成 \(completed) / \(ids.count) 项"
        }
        editMode = .inactive
      } catch {
        message = "已完成 \(completed) 项，剩余 \(selection.count) 项。\(error.localizedDescription)"
      }
    }
  }
}
