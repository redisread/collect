import Foundation

struct WidgetSnapshot: Codable, Sendable {
  struct Item: Codable, Identifiable, Sendable {
    let id: String
    let title: String
  }
  var unread: Int
  var recent: [Item]
  var continueReading: Item?
  var updatedAt: Date

  static var empty: WidgetSnapshot {
    .init(unread: 0, recent: [], continueReading: nil, updatedAt: .now)
  }
  static var fileURL: URL? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CollectAppGroup") as? String else {
      return nil
    }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
      .appendingPathComponent("reader-snapshot.json")
  }
  static func read() -> WidgetSnapshot {
    guard let fileURL, let data = try? Data(contentsOf: fileURL),
      let value = try? JSONDecoder().decode(Self.self, from: data)
    else { return .empty }
    return value
  }
  func write() throws {
    guard let url = Self.fileURL else { return }
    try JSONEncoder().encode(self).write(
      to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
}
