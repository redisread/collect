import SwiftUI
import WidgetKit

struct CollectWidgetView: View {
  let entry: ReaderEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Collect").font(.headline)
        Spacer()
        Text("\(entry.snapshot.unread) 未读").font(.caption)
      }
      if let item = entry.snapshot.continueReading ?? entry.snapshot.recent.first {
        Link(destination: URL(string: "collect://article/\(item.id)")!) {
          VStack(alignment: .leading, spacing: 4) {
            Text(entry.snapshot.continueReading == nil ? "最近文章" : "继续阅读").font(.caption)
              .foregroundStyle(.secondary)
            Text(item.title).font(.subheadline).lineLimit(3)
          }
        }
      } else {
        Text("打开 Collect 同步文章").font(.subheadline).foregroundStyle(.secondary)
      }
    }.foregroundStyle(.white).containerBackground(.black, for: .widget)
  }
}
