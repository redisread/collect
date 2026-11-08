import SwiftUI

struct FolderEditor: View {
  @Environment(LibraryStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  let folder: FolderDTO
  @State private var name = ""
  @State private var deleting = false
  @State private var error: String?
  var body: some View {
    Form {
      TextField("名称", text: $name)
      Button("保存") { perform("PUT") }
      Button("删除文件夹", role: .destructive) { deleting = true }
      Text("删除文件夹后，订阅源进入未分类。").font(.footnote).foregroundStyle(.secondary)
      if let error { Text(error).foregroundStyle(.red) }
    }.navigationTitle(folder.name)
      .onAppear { name = folder.name }
      .confirmationDialog("删除这个文件夹？", isPresented: $deleting) {
        Button("删除", role: .destructive) { perform("DELETE") }
      }
  }
  private func perform(_ method: String) {
    Task {
      do {
        try await store.command("/api/folders/\(folder.id)", method: method, fields: ["name": name])
        dismiss()
      } catch { self.error = error.localizedDescription }
    }
  }
}
