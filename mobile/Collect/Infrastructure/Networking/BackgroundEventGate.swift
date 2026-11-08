import Foundation

/// Holds the SwiftUI background handler until URLSession has drained its queued events.
@MainActor
final class BackgroundEventGate {
  private var waiters: [UUID: CheckedContinuation<Void, Never>] = [:]
  private var completedBatches = 0
  private var cancelledBatches = 0

  func wait() async {
    let id = UUID()
    await withTaskCancellationHandler {
      await withCheckedContinuation { continuation in
        if completedBatches > 0 {
          completedBatches -= 1
          continuation.resume()
        } else if Task.isCancelled {
          cancelledBatches += 1
          continuation.resume()
        } else {
          waiters[id] = continuation
        }
      }
    } onCancel: {
      Task { @MainActor in
        if let continuation = self.waiters.removeValue(forKey: id) {
          self.cancelledBatches += 1
          continuation.resume()
        }
      }
    }
  }

  func finish() {
    if cancelledBatches > 0 {
      cancelledBatches -= 1
      return
    }
    if let id = waiters.keys.first, let continuation = waiters.removeValue(forKey: id) {
      continuation.resume()
    } else {
      // On a background launch the delegate may run before the SwiftUI handler.
      completedBatches += 1
    }
  }
}
