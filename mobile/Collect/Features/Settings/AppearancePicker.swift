import SwiftUI

struct AppearancePicker: View {
  @Binding var selection: String
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var typeSize
  @Namespace private var glass
  private let options = ["system", "light", "dark"]
  private let labels = ["跟随系统", "浅色", "深色"]

  var body: some View {
    let layout = typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
    layout {
      ForEach(Array(options.enumerated()), id: \.element) { index, option in
        Button {
          withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85)) {
            selection = option
          }
        } label: {
          VStack(spacing: 8) {
            if option == "dark" {
              MoonParticles(assembled: selection == "dark")
            } else {
              Image(systemName: option == "system" ? "circle.lefthalf.filled" : "sun.max")
                .frame(width: 24, height: 24)
            }
            Text(labels[index]).font(.caption)
          }
          .frame(maxWidth: .infinity, minHeight: 64)
          .padding(4)
          .background {
            if selection == option {
              RoundedRectangle(cornerRadius: 14)
                .fill(.ultraThinMaterial)
                .overlay {
                  RoundedRectangle(cornerRadius: 14).strokeBorder(
                    AngularGradient(colors: [.white.opacity(0.15), option == "dark" ? .indigo : .orange,
                      .white.opacity(0.8), .white.opacity(0.15)], center: .center,
                      angle: .degrees(Double(index) * 90)), lineWidth: 1.5)
                }
                .shadow(color: (option == "dark" ? Color.indigo : .orange).opacity(0.2), radius: 5, y: 2)
                .matchedGeometryEffect(id: "selection", in: glass)
            }
          }
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(labels[index])
        .accessibilityAddTraits(selection == option ? [.isSelected] : [])
        .accessibilityIdentifier("appearance-\(option)")
      }
    }
    .padding(5)
    .background(.quaternary, in: .rect(cornerRadius: 18))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("外观")
  }
}
