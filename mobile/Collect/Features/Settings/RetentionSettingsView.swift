import SwiftUI

struct RetentionSettingsView: View {
  @Environment(LibraryStore.self) private var store
  @State private var days = 30
  @State private var savedDays: Int?
  @State private var preview: RetentionPreview?
  @State private var confirming = false
  @State private var busy = false
  @State private var message: String?

  var body: some View {
    Form {
      Picker("保存期限", selection: $days) {
        Text("一周").tag(7)
        Text("30 天").tag(30)
        Text("60 天").tag(60)
        Text("90 天").tag(90)
      }.disabled(busy || savedDays == nil)
      Text("从首次采集起计算，到期清理普通文章，包括未读文章。收藏和稍后阅读持续保留，取消保护后至少保留 7 天。")
        .font(.footnote).foregroundStyle(.secondary)
      Button("保存期限") { Task { await save() } }
        .disabled(busy || savedDays == nil || days == savedDays)
      if busy { ProgressView() }
      if let message { Text(message).foregroundStyle(.secondary) }
    }.navigationTitle("文章保存期限")
      .task {
        guard let session = store.session else { return }
        do {
          let value: ReaderPreferences = try await store.api.request(
            "/api/settings", token: session.token)
          days = value.articleRetentionDays
          savedDays = days
        } catch { message = error.localizedDescription }
      }
      .confirmationDialog(
        "预计清理 \(preview?.count ?? 0) 篇文章，确认缩短期限？", isPresented: $confirming,
        titleVisibility: .visible
      ) {
        Button("确认并保存", role: .destructive) { Task { await save(confirmed: true) } }
      }
  }

  private func save(confirmed: Bool = false) async {
    guard let session = store.session else { return }
    busy = true
    defer { busy = false }
    do {
      let value: RetentionPreview
      if confirmed, let preview {
        value = preview
      } else {
        value = try await store.api.request(
          "/api/settings/retention/preview", method: "POST", token: session.token,
          body: JSONEncoder().encode(["days": days]))
      }
      if value.days < value.previousDays && !confirmed {
        preview = value
        confirming = true
        return
      }
      let body = try JSONSerialization.data(withJSONObject: [
        "days": value.days, "previousDays": value.previousDays, "confirmed": confirmed,
      ])
      let _: EmptyResponse = try await store.api.request(
        "/api/settings/retention", method: "PUT", token: session.token, body: body)
      guard store.session?.token == session.token else { return }
      savedDays = value.days
      preview = nil
      message = "保存期限已同步"
      try store.savePreferences(ReaderPreferences(articleRetentionDays: value.days, translationTargetLanguage: store.language, articleSortOrder: store.articleSortOrder))
    } catch { message = error.localizedDescription }
  }
}
