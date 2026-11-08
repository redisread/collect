import SwiftUI

struct OfflineView: View {
  @Environment(LibraryStore.self) private var store
  @State private var clear = false
  private var completed: Int {
    _ = BackgroundDownloads.shared.revision
    return store.records.values.filter { CacheFiles.isComplete($0) }.count
  }
  var body: some View {
    @Bindable var store = store
    Form {
      Section {
        LabeledContent("完整离线文章", value: "\(completed) 篇")
        Text("自动缓存最近 \(store.cacheLimit) 篇未读文章，以及收藏和稍后阅读内容。正文和图片都保存后即可完整离线阅读。")
          .font(.footnote).foregroundStyle(.secondary)
        if store.isCaching { ProgressView("正在准备正文…") }
        Toggle("暂停自动缓存", isOn: $store.cachePaused)
        Button("继续下载 / 重试失败项") {
          store.cachePaused = false
          Task { if let saved = store.session { await store.cacheArticles(saved) } }
        }
      }
      Section("存储") {
        Stepper("未读缓存上限 \(store.cacheLimit) 篇", value: $store.cacheLimit, in: 20...1000, step: 20)
        Text("普通已读文章缓存保留 30 天。收藏与稍后阅读文章持续保留。")
          .font(.footnote).foregroundStyle(.secondary)
        Button("清理离线缓存", role: .destructive) { clear = true }
      }
      if let error = store.error { Text(error).foregroundStyle(.red) }
    }
    .navigationTitle("离线阅读")
    .onChange(of: store.cacheLimit) { _, value in
      UserDefaults.standard.set(value, forKey: "offlineLimit")
    }
    .onChange(of: store.cachePaused) { _, paused in
      UserDefaults.standard.set(paused, forKey: "offlinePaused")
      if paused { Task { await BackgroundDownloads.shared.cancelAll() } }
    }
    .confirmationDialog("清理已下载的正文和图片？", isPresented: $clear) {
      Button("清理缓存", role: .destructive) { Task { await store.clearCache() } }
    }
  }
}
