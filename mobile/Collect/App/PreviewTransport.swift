#if DEBUG
  import Foundation

  actor PreviewTransport: HTTPTransport {
    private var articles: [[String: Any]]
    private var feeds: [[String: Any]] = [
      ["id": "feed", "title": "阅读笔记", "feedUrl": "https://example.com/rss", "sortOrder": 0],
      [
        "id": "folder-feed", "title": "目录订阅", "feedUrl": "https://example.com/folder/rss",
        "folderId": "test-folder", "sortOrder": 1,
      ],
    ]
    private var folders: [[String: Any]] = [["id": "test-folder", "name": "测试目录", "sortOrder": 0]]
    private var sequence: Int64 = 1

    init(progress: Int = 0) {
      let article: [String: Any] = [
        "id": "sample", "feedId": "feed", "title": "给阅读留一点时间", "url": "https://example.com/article",
        "summary": "专注于值得阅读的内容。", "publishedAt": "2026-11-08T10:00:00Z",
        "content": progress > 0
          ? (1...80).map { "<p>段落 \($0)</p>" }.joined() + "<p>阅读终点</p>"
          : "<p>这是一篇本地测试文章。</p><h2>离线阅读</h2><p>正文与阅读状态在设备上保存。</p>",
        "images": [String](), "isRead": false, "isStarred": false, "isReadLater": false,
        "readingProgress": progress,
        "readVersion": 0, "starVersion": 0, "laterVersion": 0, "progressVersion": 0,
      ]
      var folderArticle = article
      folderArticle["id"] = "folder-article"
      folderArticle["feedId"] = "folder-feed"
      folderArticle["title"] = "目录中的文章"
      folderArticle["isRead"] = true
      articles = [article, folderArticle]
    }

    func send(_ request: URLRequest) async throws -> (Data, Int) {
      let path = request.url?.path ?? ""
      let method = request.httpMethod ?? "GET"
      let fields =
        try request.httpBody.map { try JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        ?? nil
      let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
      let id = request.url?.lastPathComponent ?? ""
      let data: Any
      if path == "/api/native/sync" {
        let after = Int64(query.first(where: { $0.name == "after" })?.value ?? "0") ?? 0
        let changed = after < sequence
        data = [
          "cursor": sequence, "hasMore": false, "articles": changed ? articles : [],
          "feeds": changed ? feeds : [], "folders": changed ? folders : [], "deleted": [],
          "preferences": ["articleRetentionDays": 30, "translationTargetLanguage": "zh-CN"],
        ]
      } else if path == "/api/feeds/batch/move" || path == "/api/feeds/batch/unsubscribe" {
        let ids = fields?["ids"] as? [String] ?? []
        let unsubscribe = path.hasSuffix("unsubscribe")
        for index in feeds.indices where ids.contains(feeds[index]["id"] as? String ?? "") {
          feeds[index]["folderId"] = unsubscribe ? NSNull() : fields?["folderId"] ?? NSNull()
          if unsubscribe { feeds[index]["unsubscribedAt"] = "2026-11-08T12:00:00Z" }
        }
        if unsubscribe {
          articles.removeAll {
            ids.contains($0["feedId"] as? String ?? "") && $0["isStarred"] as? Bool != true
              && $0["isReadLater"] as? Bool != true
          }
        }
        sequence += 1
        data = [
          "feeds": feeds.filter { ids.contains($0["id"] as? String ?? "") },
          "articles": unsubscribe
            ? articles.filter { ids.contains($0["feedId"] as? String ?? "") } : [],
        ]
      } else if path == "/api/feeds", method == "POST" {
        let feed: [String: Any] = [
          "id": "added-\(feeds.count)", "title": "新订阅", "feedUrl": fields?["url"] ?? "",
          "folderId": fields?["folderId"] ?? NSNull(), "sortOrder": feeds.count,
        ]
        feeds.append(feed)
        sequence += 1
        data = feed
      } else if path.hasPrefix("/api/feeds/"), method == "PUT",
        let index = feeds.firstIndex(where: { $0["id"] as? String == id })
      {
        feeds[index].merge(fields ?? [:]) { _, new in new }
        sequence += 1
        data = feeds[index]
      } else if path == "/api/folders/reorder" {
        let ids = fields?["ids"] as? [String] ?? []
        for index in folders.indices {
          folders[index]["sortOrder"] =
            ids.firstIndex(of: folders[index]["id"] as? String ?? "") ?? index
        }
        sequence += 1
        data = ["folders": folders]
      } else if path == "/api/folders", method == "POST" {
        let folder: [String: Any] = [
          "id": "new-folder-\(folders.count)", "name": fields?["name"] ?? "",
          "sortOrder": folders.count,
        ]
        folders.append(folder)
        sequence += 1
        data = folder
      } else if path.hasPrefix("/api/folders/"), method == "DELETE" {
        folders.removeAll { $0["id"] as? String == id }
        for index in feeds.indices where feeds[index]["folderId"] as? String == id {
          feeds[index]["folderId"] = NSNull()
        }
        sequence += 1
        data = ["id": id]
      } else if path.hasPrefix("/api/folders/"), method == "PUT",
        let index = folders.firstIndex(where: { $0["id"] as? String == id })
      {
        folders[index].merge(fields ?? [:]) { _, new in new }
        sequence += 1
        data = folders[index]
      } else if path == "/api/settings" {
        data = ["articleRetentionDays": 30, "translationTargetLanguage": "zh-CN"]
      } else if path == "/api/native/articles" {
        let feedID = query.first(where: { $0.name == "feedId" })?.value
        data = [
          "articles": articles.filter { feedID == nil || $0["feedId"] as? String == feedID },
          "next": NSNull(),
        ]
      } else if path.hasPrefix("/api/native/articles/"),
        let index = articles.firstIndex(where: { $0["id"] as? String == id })
      {
        if method == "PATCH", let field = fields?["field"] as? String {
          articles[index][field] = fields?["value"]
          let names = [
            "isRead": "readVersion", "isStarred": "starVersion", "isReadLater": "laterVersion",
            "readingProgress": "progressVersion",
          ]
          if let key = names[field] {
            articles[index][key] = (articles[index][key] as? Int ?? 0) + 1
          }
          sequence += 1
        }
        data = articles[index]
      } else {
        data = [String: String]()
      }
      return (try JSONSerialization.data(withJSONObject: ["success": true, "data": data]), 200)
    }
  }
#endif
