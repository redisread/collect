import CoreGraphics
import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ProfileSettingsView: View {
  @Environment(LibraryStore.self) private var store
  @State private var name = ""
  @State private var image: CGImage?
  @State private var source: CGImage?
  @State private var position = 0.5
  @State private var selection: PhotosPickerItem?
  @State private var busy = false
  @State private var message: String?
  private var cropped: CGImage? {
    guard let source else { return nil }
    let side = CGFloat(min(source.width, source.height))
    let x = ((CGFloat(source.width) - side) * CGFloat(position)).rounded(.down)
    let y = ((CGFloat(source.height) - side) * CGFloat(position)).rounded(.down)
    return source.cropping(to: CGRect(x: x, y: y, width: side, height: side))
  }
  var body: some View {
    Form {
      profileFields
      avatarFields
      if busy { ProgressView() }
      if let message { Text(message).foregroundStyle(.secondary) }
    }.navigationTitle("个人资料")
      .task { await load() }
      .task(id: selection) { await loadPhoto() }
  }
  private var profileFields: some View {
    Group {
      if let image {
        Image(decorative: image, scale: 1).resizable().scaledToFit().frame(width: 80, height: 80)
          .clipShape(Circle())
      }
      Text(store.session?.account.email ?? "").foregroundStyle(.secondary)
      TextField("显示名称", text: $name)
      Button("保存名称") { Task { await saveName() } }.disabled(
        busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 40)
    }
  }
  private var avatarFields: some View {
    Group {
      PhotosPicker("更新头像", selection: $selection, matching: .images).disabled(busy)
      if let cropped {
        Image(decorative: cropped, scale: 1).resizable().scaledToFit().frame(height: 192)
        Slider(value: $position, in: 0...1) { Text("裁剪位置") }
        Button("保存头像") { Task { await upload(cropped) } }.disabled(busy)
      }
      if store.session?.account.image != nil {
        Button("移除头像", role: .destructive) { Task { await removeImage() } }.disabled(busy)
      }
    }
  }
  private func loadPhoto() async {
    guard let selection else { return }
    do {
      guard let data = try await selection.loadTransferable(type: Data.self),
        data.count <= 10 * 1024 * 1024,
        let value = CGImageSourceCreateWithData(data as CFData, nil)
      else { throw APIError(status: 0, message: "请选择 10 MB 以内的有效图片") }
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 512,
      ]
      guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(value, 0, options as CFDictionary)
      else {
        throw APIError(status: 0, message: "无法读取图片")
      }
      source = thumbnail
      position = 0.5
    } catch { message = error.localizedDescription }
  }
  private func load() async {
    guard let session = store.session else { return }
    do {
      let value: Account = try await store.api.request("/api/profile", token: session.token)
      guard store.session?.token == session.token else { return }
      try store.applyProfile(value, token: session.token)
      name = value.name
      image = nil
      if let path = value.image, path.hasPrefix("/api/profile/avatar/") {
        let (data, status) = try await store.api.raw(path, token: session.token)
        guard status == 200, store.session?.token == session.token,
          let source = CGImageSourceCreateWithData(data as CFData, nil)
        else { return }
        image = CGImageSourceCreateImageAtIndex(source, 0, nil)
      }
    } catch { message = error.localizedDescription }
  }
  private func saveName() async {
    guard let session = store.session else { return }
    busy = true
    defer { busy = false }
    do {
      let value: Account = try await store.api.request(
        "/api/profile", method: "PUT", token: session.token,
        body: JSONEncoder().encode(["name": name]))
      try store.applyProfile(value, token: session.token)
      name = value.name
      message = "已保存"
    } catch { message = error.localizedDescription }
  }
  private func upload(_ image: CGImage) async {
    guard let session = store.session else { return }
    busy = true
    defer { busy = false }
    do {
      let data = NSMutableData()
      guard
        let destination = CGImageDestinationCreateWithData(
          data, UTType.png.identifier as CFString, 1, nil)
      else { return }
      CGImageDestinationAddImage(destination, image, nil)
      guard CGImageDestinationFinalize(destination) else { return }
      let (response, status) = try await store.api.raw(
        "/api/profile/avatar", method: "POST", token: session.token, body: data as Data,
        contentType: "image/png")
      let result = try JSONDecoder().decode(APIEnvelope<Account>.self, from: response)
      guard status == 200, let account = result.data else {
        throw APIError(status: status, message: result.error ?? "头像上传失败")
      }
      try store.applyProfile(account, token: session.token)
      self.image = image
      source = nil
      message = "头像已更新"
    } catch { message = error.localizedDescription }
  }
  private func removeImage() async {
    guard let session = store.session else { return }
    busy = true
    defer { busy = false }
    do {
      let account: Account = try await store.api.request(
        "/api/profile/avatar", method: "DELETE", token: session.token)
      try store.applyProfile(account, token: session.token)
      image = nil
      message = "头像已移除"
    } catch { message = error.localizedDescription }
  }
}
