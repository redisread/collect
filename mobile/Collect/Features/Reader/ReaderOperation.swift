enum ReaderOperation {
  case translation
  case extraction

  var title: String {
    switch self {
    case .translation: "正在翻译…"
    case .extraction: "正在提取全文…"
    }
  }
}
