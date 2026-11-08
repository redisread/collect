import Testing

@testable import Collect

struct BackgroundEventTests {
  @Test @MainActor func buffersCompletionBeforeHandlerStarts() async {
    let gate = BackgroundEventGate()
    gate.finish()
    await gate.wait()
  }
  @Test @MainActor func resumesHandlerAfterDelegateFinishes() async {
    let gate = BackgroundEventGate()
    let waiter = Task { await gate.wait() }
    await Task.yield()
    gate.finish()
    await waiter.value
  }
  @Test @MainActor func cancellationDoesNotLeakCompletionToNextBatch() async {
    let gate = BackgroundEventGate()
    let waiter = Task { await gate.wait() }
    await Task.yield()
    waiter.cancel()
    await waiter.value
    gate.finish()
    gate.finish()
    await gate.wait()
  }
}
