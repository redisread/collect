import SwiftUI

struct ReaderActionsMenu: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Binding var mode: Int
  let url: URL?
  let isRead: Bool
  let language: String
  let hasBody: Bool
  let hasBilingual: Bool
  let hasTranslation: Bool
  let operation: ReaderOperation?
  let message: String?
  let openArticle: () -> Void
  let toggleRead: () -> Void
  let extract: () -> Void
  let translate: () -> Void
  var feedTitle: String? = nil
  var autoExtract = false
  var enableAutoExtract: () -> Void = {}

  private var languageName: String {
    switch language {
    case "zh-CN": "简体中文"
    case "zh-TW": "繁体中文"
    default: Locale(identifier: "zh-CN").localizedString(forIdentifier: language) ?? language
    }
  }

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        if let url {
          Button {
            dismiss()
            openArticle()
          } label: {
            ReaderActionLabel(title: "在浏览器中打开", systemImage: "arrow.up.right.square")
          }
          ShareLink(item: url) {
            ReaderActionLabel(title: "分享", systemImage: "square.and.arrow.up")
          }
        }
        Button {
          toggleRead()
          dismiss()
        } label: {
          ReaderActionLabel(
            title: isRead ? "标记未读" : "标记已读", systemImage: isRead ? "envelope" : "envelope.open")
        }
        Divider().padding(.horizontal, 16).padding(.vertical, 8)
        Button(action: extract) {
          ReaderActionLabel(
            title: operation == .extraction ? "正在提取全文…" : "提取全文",
            systemImage: "doc.text", processing: operation == .extraction)
        }
        .disabled(operation != nil)
        if let feedTitle {
          Button(action: enableAutoExtract) {
            VStack(alignment: .leading, spacing: 0) {
              ReaderActionLabel(title: autoExtract ? "已启用自动抓取原文" : "为此订阅源自动抓取原文",
                systemImage: autoExtract ? "checkmark.circle" : "doc.badge.gearshape")
              Text(feedTitle).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 16)
            }
          }
          .disabled(autoExtract || operation != nil)
        }
        Button(action: translate) {
          ReaderActionLabel(
            title: operation == .translation ? "正在翻译…" : "翻译为\(languageName)",
            systemImage: "translate", processing: operation == .translation)
        }
        .disabled(operation != nil || !hasBody)
        Divider().padding(.horizontal, 16).padding(.vertical, 8)
        VStack(alignment: .leading, spacing: 12) {
          Text("阅读模式").font(.caption).foregroundStyle(.secondary)
          let layout =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4)) : AnyLayout(HStackLayout(spacing: 4))
          layout {
            ForEach(0..<3) { option in
              Button {
                mode = option
              } label: {
                HStack(spacing: 4) {
                  if mode == option {
                    Image(systemName: "checkmark").foregroundStyle(.orange)
                      .accessibilityHidden(true)
                  }
                  Text(["原文", "双语", "译文"][option])
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background {
                  if mode == option {
                    RoundedRectangle(cornerRadius: 10).fill(.background)
                      .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                  }
                }
                .contentShape(.rect)
              }
              .disabled(option == 1 && !hasBilingual || option == 2 && !hasTranslation)
              .accessibilityAddTraits(mode == option ? [.isSelected] : [])
              .accessibilityIdentifier("reader-mode-\(option)")
            }
          }
          .padding(4)
          .background(.quaternary, in: .rect(cornerRadius: 14))
          .accessibilityElement(children: .contain)
          .accessibilityLabel("阅读模式")
          if !hasBilingual || !hasTranslation {
            Text("翻译后可切换双语或译文")
              .font(.caption).foregroundStyle(.secondary)
          }
          if let message {
            Text(message).font(.caption).foregroundStyle(.secondary)
              .accessibilityIdentifier("reader-operation-message")
          }
        }
        .padding(16)
      }
      .padding(8)
    }
    .accessibilityIdentifier("reader-actions-scroll")
    .scrollBounceBehavior(.basedOnSize)
    .frame(width: 304)
    .frame(maxHeight: 500)
    .fixedSize(horizontal: false, vertical: true)
    .buttonStyle(.plain)
    .foregroundStyle(.primary)
    .presentationBackground(.regularMaterial)
    .presentationCompactAdaptation(.popover)
  }
}
