import Foundation

enum ArticleScope: Hashable {
  case all, unread, starred, later, unfiled
  case feed(String)
  case folder(String)
  var title: String {
    switch self {
    case .all: "全部文章"
    case .unread: "未读"
    case .starred: "收藏"
    case .later: "稍后阅读"
    case .unfiled: "未分类"
    case .feed, .folder: "文章"
    }
  }
}
