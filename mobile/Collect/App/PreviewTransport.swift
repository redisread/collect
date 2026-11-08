#if DEBUG
  import Foundation

  actor PreviewTransport: HTTPTransport {
    private var article: [String: Any] = [
      "id": "sample", "feedId": "feed", "title": "给阅读留一点时间", "url": "https://example.com/article",
      "summary": "专注于值得阅读的内容。", "publishedAt": "2026-11-08T10:00:00Z",
      "content": "<p>这是一篇本地测试文章。</p><h2>离线阅读</h2><p>正文与阅读状态在设备上保存。</p>",
      "images": [String](), "isRead": false, "isStarred": false, "isReadLater": false,
      "readingProgress": 0,
      "readVersion": 0, "starVersion": 0, "laterVersion": 0, "progressVersion": 0,
    ]
    init(progress: Int = 0) {
      if progress > 0 {
        article["readingProgress"] = progress
        article["content"] = (1...80).map { "<p>段落 \($0)</p>" }.joined() + "<p>阅读终点</p>"
      }
    }

    private var syncSequence: Int64 = 1

    func send(_ request: URLRequest) async throws -> (Data, Int) {
      let path = request.url?.path ?? ""
      let data: Any
      if path == "/api/native/sync" {
        let after =
          URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first(
            where: { $0.name == "after" })?.value ?? "0"
        var folderArticle = article
        folderArticle["id"] = "folder-article"
        folderArticle["feedId"] = "folder-feed"
        folderArticle["title"] = "目录中的文章"
        folderArticle["isRead"] = true
        let changed = (Int64(after) ?? 0) < syncSequence
        data = [
          "cursor": syncSequence, "hasMore": false,
          "articles": changed ? [article, folderArticle] : [],
          "feeds": after == "0"
            ? [
              ["id": "feed", "title": "阅读笔记", "feedUrl": "https://example.com/rss"],
              [
                "id": "folder-feed", "title": "目录订阅", "feedUrl": "https://example.com/folder/rss",
                "folderId": "test-folder",
              ],
            ] : [],
          "folders": after == "0" ? [["id": "test-folder", "name": "测试目录"]] : [],
          "deleted": [],
          "preferences": ["articleRetentionDays": 30, "translationTargetLanguage": "zh-CN"],
        ]
      } else if path == "/api/settings" {
        data = ["articleRetentionDays": 30, "translationTargetLanguage": "zh-CN"]
      } else if path == "/api/feeds" {
        data = [
          ["id": "feed", "title": "阅读笔记", "feedUrl": "https://example.com/rss"],
          [
            "id": "folder-feed", "title": "目录订阅", "feedUrl": "https://example.com/folder/rss",
            "folderId": "test-folder",
          ],
        ]
      } else if path == "/api/folders" {
        data = [["id": "test-folder", "name": "测试目录", "order": 0]]
      } else if path == "/api/native/articles" {
        var folderArticle = article
        folderArticle["id"] = "folder-article"
        folderArticle["feedId"] = "folder-feed"
        folderArticle["title"] = "目录中的文章"
        folderArticle["isRead"] = true
        data = ["articles": [article, folderArticle], "next": NSNull()]
      } else if path == "/api/native/articles/sample" {
        if request.httpMethod == "PATCH", let body = request.httpBody,
          let mutation = try JSONSerialization.jsonObject(with: body) as? [String: Any],
          let field = mutation["field"] as? String
        {
          article[field] = mutation["value"]
          syncSequence += 1
          let names = [
            "isRead": "readVersion", "isStarred": "starVersion", "isReadLater": "laterVersion",
            "readingProgress": "progressVersion",
          ]
          if let key = names[field] { article[key] = (article[key] as? Int ?? 0) + 1 }
        }
        data = article
      } else {
        data = [String: String]()
      }
      return (try JSONSerialization.data(withJSONObject: ["success": true, "data": data]), 200)
    }
  }
#endif
