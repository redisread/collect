import SwiftUI
import WidgetKit

@main
struct CollectWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CollectReader", provider: ReaderTimeline()) { CollectWidgetView(entry: $0) }
            .configurationDisplayName("Collect 阅读")
            .description("未读数量、最近文章和继续阅读")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
