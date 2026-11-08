import SwiftUI

struct FolderManagementView: View {
  @Environment(LibraryStore.self) private var store
  @State private var editMode: EditMode = .inactive
  @State private var creating = false
  @State private var name = ""
  @State private var busy = false
  @State private var message: String?

  var body: some View {
    List {
      ForEach(store.folders) { folder in
        NavigationLink {
          FolderEditor(folder: folder)
        } label: {
          HStack {
            Text(folder.name)
            Spacer()
            Text(store.activeFeeds.filter { $0.folderId == folder.id }.count, format: .number)
              .foregroundStyle(.secondary)
          }
        }.moveDisabled(busy)
      }.onMove(perform: move)
      Section {
        Text("未分类由系统管理，不能重命名或删除。").font(.footnote).foregroundStyle(.secondary)
        if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
      }
    }
    .environment(\.editMode, $editMode)
    .disabled(busy)
    .scrollContentBackground(.hidden)
    .background(Color("ReaderBackground"))
    .navigationTitle("管理文件夹")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HStack {
          Button(editMode == .active ? "完成" : "排序") {
            editMode = editMode == .active ? .inactive : .active
          }
          Button("新建文件夹", systemImage: "folder.badge.plus") {
            name = ""
            creating = true
          }
        }.disabled(busy)
      }
    }
    .alert("新建文件夹", isPresented: $creating) {
      TextField("文件夹名称", text: $name)
      Button("取消", role: .cancel) {}
      Button("创建") { create() }.disabled(
        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name == "未分类")
    }
  }

  private func create() {
    busy = true
    Task {
      defer { busy = false }
      do {
        try await store.command(
          "/api/folders", method: "POST",
          fields: ["name": name.trimmingCharacters(in: .whitespacesAndNewlines)])
      } catch { message = error.localizedDescription }
    }
  }

  private func move(from offsets: IndexSet, to destination: Int) {
    guard !busy else { return }
    var ordered = store.folders.map(\.id)
    ordered.move(fromOffsets: offsets, toOffset: destination)
    busy = true
    Task {
      defer { busy = false }
      do { try await store.reorderFolders(ordered) } catch { message = error.localizedDescription }
    }
  }
}
