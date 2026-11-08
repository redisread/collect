import Foundation
import Observation

@MainActor @Observable
final class BackgroundDownloads: NSObject, URLSessionDownloadDelegate {
    static let identifier = "com.example.collect.offline-images"
    static let shared = BackgroundDownloads()
    var revision = 0
    var failures = 0
    private var scheduled = Set<String>()
    @ObservationIgnored private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: BackgroundDownloads.identifier)
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.allowsCellularAccess = true
        configuration.isDiscretionary = false
        configuration.httpMaximumConnectionsPerHost = 3
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    func restore() async {
        let tasks = await session.allTasks
        scheduled = Set(tasks.compactMap(\.taskDescription))
        revision += 1
    }
    func enqueue(owner: String, source: String) {
        let key = CacheFiles.key(owner: owner, url: source)
        guard !scheduled.contains(key), !FileManager.default.fileExists(atPath: CacheFiles.file(key).path),
              let url = URL(string: source), url.scheme == "https" else { return }
        scheduled.insert(key)
        let task = session.downloadTask(with: url)
        task.taskDescription = key
        task.resume()
    }
    func cancelAll() async {
        for task in await session.allTasks { task.cancel() }
        scheduled.removeAll()
        revision += 1
    }
    nonisolated func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let key = downloadTask.taskDescription, key.count == 64,
              key.allSatisfy({ $0.isHexDigit }),
              let response = downloadTask.response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode),
              response.mimeType?.hasPrefix("image/") == true,
              response.mimeType != "image/svg+xml" else { return }
        do {
            let size = try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 20_000_000 else { return }
            try FileManager.default.createDirectory(at: CacheFiles.root, withIntermediateDirectories: true)
            let destination = CacheFiles.file(key)
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.moveItem(at: location, to: destination)
        } catch { /* The missing file keeps the article eligible for retry. */ }
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let key = task.taskDescription
        let failed = error != nil
        Task { @MainActor [weak self] in
            if let key { self?.scheduled.remove(key) }
            if failed { self?.failures += 1 }
            self?.revision += 1
        }
    }
}
