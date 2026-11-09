import SwiftUI

struct ReaderView: View {
  @Environment(LibraryStore.self) private var store
  @State private var currentID: String
  @State private var startsAtTop = false
  private let articleIDs: [String]

  init(articleID: String, articleIDs: [String] = []) {
    _currentID = State(initialValue: articleID)
    self.articleIDs = articleIDs.isEmpty ? [articleID] : articleIDs
  }

  private var nextID: String? {
    guard let index = articleIDs.firstIndex(of: currentID) else { return nil }
    return articleIDs.dropFirst(index + 1).first { id in store.articles.contains { $0.id == id } }
  }

  var body: some View {
    ReaderArticleView(articleID: currentID, hasNext: nextID != nil, startsAtTop: startsAtTop) {
      guard let nextID else { return }
      startsAtTop = true
      currentID = nextID
    }
    .id(currentID)
  }
}
