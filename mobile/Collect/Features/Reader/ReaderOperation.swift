enum ReaderOperation {
  case translation
  case extraction
  case savingFeed

  var title: String {
    switch self {
    case .translation: "正在翻译…"
    case .savingFeed: "正在保存订阅源设置…"
    case .extraction: "正在提取全文…"
    }
  }
}
