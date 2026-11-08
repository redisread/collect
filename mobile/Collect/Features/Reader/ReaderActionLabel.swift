import SwiftUI

struct ReaderActionLabel: View {
  let title: String
  let systemImage: String
  var processing = false

  var body: some View {
    HStack(spacing: 16) {
      Group {
        if processing {
          ProgressView().controlSize(.small)
        } else {
          Image(systemName: systemImage).foregroundStyle(.secondary)
        }
      }
      .frame(width: 20)
      .accessibilityHidden(true)
      Text(title).frame(maxWidth: .infinity, alignment: .leading)
    }
    .font(.body)
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .frame(minHeight: 48)
    .contentShape(.rect)
  }
}
