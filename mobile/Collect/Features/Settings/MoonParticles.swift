import SwiftUI

struct MoonParticles: View {
  let assembled: Bool
  private static let points: [CGPoint] = (0..<121).compactMap { index in
    let x = Double(index % 11) * 1.7 - 8.5
    let y = Double(index / 11) * 1.7 - 8.5
    guard x * x + y * y < 75, pow(x - 5, 2) + pow(y + 3, 2) > 55 else { return nil }
    return CGPoint(x: x, y: y)
  }

  var body: some View {
    ZStack {
      ForEach(Self.points.indices, id: \.self) { index in
        Circle().fill(.primary.opacity(assembled ? 1 : 0.45))
          .frame(width: 1.8, height: 1.8)
          .offset(x: assembled ? Self.points[index].x : sin(Double(index) * 2.4) * 11,
            y: assembled ? Self.points[index].y : cos(Double(index) * 1.7) * 11)
      }
    }
    .frame(width: 24, height: 24)
    .accessibilityHidden(true)
  }
}
