#if DEBUG
import Foundation

actor PreviewTransport: HTTPTransport {
    private var article: [String: Any] = [
        "id": "sample", "feedId": "feed", "title": "给阅读留一点时间", "url": "https://example.com/article",
        "summary": "专注于值得阅读的内容。", "publishedAt": "2026-11-08T10:00:00Z", "content": "<p>这是一篇本地测试文章。</p><h2>离线阅读</h2><p>正文与阅读状态在设备上保存。</p>",
        "images": [String](), "isRead": false, "isStarred": false, "isReadLater": false, "readingProgress": 0,
        "readVersion": 0, "starVersion": 0, "laterVersion": 0, "progressVersion": 0,
    ]
    func send(_ request: URLRequest) async throws -> (Data, Int) {
        let path = request.url?.path ?? ""
        let data: Any
        if path == "/api/feeds" {
            data = [["id": "feed", "title": "阅读笔记", "feedUrl": "https://example.com/rss"]]
        } else if path == "/api/folders" { data = [[String: String]]() }
        else if path == "/api/native/articles" { data = ["articles": [article], "next": NSNull()] }
        else if path == "/api/native/articles/sample" {
            if request.httpMethod == "PATCH", let body = request.httpBody,
               let mutation = try JSONSerialization.jsonObject(with: body) as? [String: Any], let field = mutation["field"] as? String {
                article[field] = mutation["value"]
                let names = ["isRead": "readVersion", "isStarred": "starVersion", "isReadLater": "laterVersion", "readingProgress": "progressVersion"]
                if let key = names[field] { article[key] = (article[key] as? Int ?? 0) + 1 }
            }
            data = article
        } else { data = [String: String]() }
        return (try JSONSerialization.data(withJSONObject: ["success": true, "data": data]), 200)
    }
}
#endif
