import SwiftUI

struct AddSubscriptionView: View {
  @Environment(LibraryStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var url = ""
  @State private var folder: String
  init(folderID: String? = nil) { _folder = State(initialValue: folderID ?? "") }
  @State private var folderName = ""
  @State private var busy = false
  @State private var error: String?
  var body: some View {
    NavigationStack {
      Form {
        Section("订阅地址") {
          TextField("https://", text: $url).keyboardType(.URL).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Picker("添加到文件夹", selection: $folder) {
            Text("未分类").tag("")
            ForEach(store.folders) { Text($0.name).tag($0.id) }
          }
          Button("添加订阅") { addFeed() }.disabled(url.isEmpty || busy)
            .accessibilityIdentifier("submit-subscription")
        }
        Section("文件夹") {
          TextField("文件夹名称", text: $folderName)
          Button("创建文件夹") { addFolder() }.disabled(
            folderName.trimmingCharacters(in: .whitespaces).isEmpty || busy)
        }
        if busy { ProgressView("正在保存…") }
        if let error { Text(error).foregroundStyle(.red) }
      }.disabled(busy).scrollContentBackground(.hidden).background(Color("ReaderBackground"))
        .navigationTitle("添加")
        .toolbar { Button("关闭") { dismiss() }.disabled(busy) }
        .interactiveDismissDisabled(busy)
    }
  }
  private func addFeed() {
    busy = true
    Task {
      do {
        var fields = ["url": url.trimmingCharacters(in: .whitespacesAndNewlines)]
        if !folder.isEmpty { fields["folderId"] = folder }
        try await store.command("/api/feeds", method: "POST", fields: fields)
        dismiss()
      } catch { self.error = error.localizedDescription }
      busy = false
    }
  }
  private func addFolder() {
    busy = true
    Task {
      do {
        try await store.command("/api/folders", method: "POST", fields: ["name": folderName])
        dismiss()
      } catch { self.error = error.localizedDescription }
      busy = false
    }
  }
}
