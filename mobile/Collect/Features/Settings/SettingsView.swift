import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
  @Environment(LibraryStore.self) private var store
  @AppStorage("appearance") private var appearance = "system"
  @State private var importing = false
  @State private var exporting = false
  @State private var document = OPMLDocument()
  @State private var job: ImportJob?
  @State private var message: String?
  @State private var logout = false
  @State private var language = "zh-CN"
  var body: some View {
    Form {
      Section("账号") {
        NavigationLink("个人资料") { ProfileSettingsView() }
        Text(store.session?.account.email ?? "")
        Button("退出登录", role: .destructive) { logout = true }
      }
      Section("阅读") {
        Picker("外观", selection: $appearance) {
          Text("跟随系统").tag("system")
          Text("浅色").tag("light")
          Text("深色").tag("dark")
        }
        NavigationLink("文章保存期限") { RetentionSettingsView() }
        Picker("翻译语言", selection: $language) {
          Text("简体中文").tag("zh-CN")
          Text("繁體中文").tag("zh-TW")
          Text("English").tag("en")
          Text("日本語").tag("ja")
        }
      }
      Section("订阅文件") {
        Button("导入 OPML") { importing = true }
        Button("导出 OPML") { export() }
        if let job {
          Text("\(job.total) 个条目 · 已导入 \(job.imported) · 跳过 \(job.skipped) · 失败 \(job.failed)")
          if job.status == "preview" {
            Button("确认导入") { confirm(job.id) }
          } else {
            Button("刷新导入进度") { refresh(job.id) }
          }
        }
      }
      if let message { Text(message).foregroundStyle(.secondary) }
    }.navigationTitle("设置")
      .onAppear { language = store.language }
      .onChange(of: language) { _, value in
        guard value != store.language else { return }
        Task {
          guard let session = store.session else { return }
          do {
            let _: EmptyResponse = try await store.api.request(
              "/api/settings/translation", method: "PUT", token: session.token,
              body: JSONEncoder().encode(["targetLanguage": value]))
            guard store.session?.token == session.token else { return }
            try store.savePreferences(ReaderPreferences(articleRetentionDays: store.articleRetentionDays, translationTargetLanguage: value))
          } catch { message = error.localizedDescription }
        }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.xml, .data]) { result in
        Task {
          do {
            let url = try result.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 2 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
            let data = try Data(contentsOf: url)
            guard data.count <= 2 * 1024 * 1024, let session = store.session else {
              throw CocoaError(.fileReadTooLarge)
            }
            let (response, status) = try await store.api.raw(
              "/api/opml/preview", method: "POST", token: session.token, body: data,
              contentType: "text/xml")
            let envelope = try JSONDecoder().decode(APIEnvelope<ImportJob>.self, from: response)
            guard status == 201 else {
              throw APIError(status: status, message: envelope.error ?? "导入失败")
            }
            job = envelope.data
          } catch { message = error.localizedDescription }
        }
      }
      .fileExporter(
        isPresented: $exporting, document: document, contentType: .xml,
        defaultFilename: "Collect.opml"
      ) { result in
        if case .failure(let error) = result { message = error.localizedDescription }
      }
      .confirmationDialog("退出当前账号？尚未同步的修改将在下次登录后继续同步。", isPresented: $logout) {
        Button("退出登录", role: .destructive) { Task { await store.signOut() } }
      }
  }
  private func export() {
    Task {
      do {
        guard let session = store.session else { return }
        let (data, status) = try await store.api.raw("/api/opml", token: session.token)
        guard status == 200 else { throw APIError(status: status, message: "导出失败") }
        document = OPMLDocument(data: data)
        exporting = true
      } catch { message = error.localizedDescription }
    }
  }
  private func confirm(_ id: String) {
    Task {
      do {
        guard let session = store.session else { return }
        job = try await store.api.request(
          "/api/opml/jobs/\(id)/confirm", method: "POST", token: session.token)
        message = "导入已开始，完成后下拉刷新订阅列表"
      } catch { message = error.localizedDescription }
    }
  }
  private func refresh(_ id: String) {
    Task {
      do {
        guard let session = store.session else { return }
        job = try await store.api.request("/api/opml/jobs/\(id)", token: session.token)
        if job?.status == "completed" { message = "导入完成，请下拉刷新订阅列表" }
      } catch { message = error.localizedDescription }
    }
  }
}
