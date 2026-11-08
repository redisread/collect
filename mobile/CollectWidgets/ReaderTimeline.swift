import SwiftUI
import WidgetKit

struct ReaderTimeline: TimelineProvider {
  func placeholder(in context: Context) -> ReaderEntry { .init(date: .now, snapshot: .empty) }
  func getSnapshot(in context: Context, completion: @escaping (ReaderEntry) -> Void) {
    completion(.init(date: .now, snapshot: .read()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<ReaderEntry>) -> Void) {
    completion(
      Timeline(
        entries: [.init(date: .now, snapshot: .read())],
        policy: .after(.now.addingTimeInterval(1800))))
  }
}
