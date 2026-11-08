import SwiftUI

struct FeedEditor: View {
  @Environment(LibraryStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let feed: FeedDTO
  @State private var autoExtract = false
  @State private var folder = ""
  @State private var deleting = false
  @State private var error: String?
  var body: some View {
    Form {
      Text(feed.feedUrl).font(.footnote).textSelection(.enabled)
      Toggle("自动提取全文", isOn: $autoExtract)
      Picker("文件夹", selection: $folder) {
        Text("未分类").tag("")
        ForEach(store.folders) { Text($0.name).tag($0.id) }
      }
      Button("保存位置") {
        Task {
          do {
            guard let session = store.session else { return }
            let body = try JSONSerialization.data(withJSONObject: [
              "autoExtract": autoExtract, "folderId": folder.isEmpty ? NSNull() : folder as Any,
            ])
            let updated: FeedDTO = try await store.api.request(
              "/api/feeds/\(feed.id)", method: "PUT", token: session.token, body: body)
            guard store.session?.token == session.token else { return }
            try store.applyFeed(updated)
            dismiss()
          } catch { self.error = error.localizedDescription }
        }
      }
      Button("取消订阅", role: .destructive) { deleting = true }
      if let error { Text(error).foregroundStyle(.red) }
    }.navigationTitle(feed.title)
      .onAppear {
        folder = feed.folderId ?? ""
        autoExtract = feed.autoExtract == true
      }
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
