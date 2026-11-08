import SwiftUI

struct FeedEditor: View {
  @Environment(LibraryStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let feed: FeedDTO
  @State private var folder = ""
  @State private var deleting = false
  @State private var error: String?
  var body: some View {
    Form {
      Text(feed.feedUrl).font(.footnote).textSelection(.enabled)
      Picker("文件夹", selection: $folder) {
        Text("未分类").tag("")
        ForEach(store.folders) { Text($0.name).tag($0.id) }
      }
      Button("保存位置") {
        Task {
          do {
            try await store.moveFeed(feed.id, folder: folder.isEmpty ? nil : folder)
            dismiss()
          } catch { self.error = error.localizedDescription }
        }
      }
      Button("取消订阅", role: .destructive) { deleting = true }
      if let error { Text(error).foregroundStyle(.red) }
    }.navigationTitle(feed.title)
      .onAppear { folder = feed.folderId ?? "" }
      .confirmationDialog("取消订阅将删除该订阅的文章", isPresented: $deleting) {
        Button("取消订阅", role: .destructive) {
          Task {
            do {
              try await store.command("/api/feeds/\(feed.id)", method: "DELETE")
              dismiss()
            } catch { self.error = error.localizedDescription }
          }
        }
      }
  }
}
