import BackgroundTasks
import Network
import SwiftData
import SwiftUI

@main
struct CollectApp: App {
  @AppStorage("appearance") private var appearance = "system"
  @State private var store: LibraryStore?
  @State private var startupError: String?
  @Environment(\.scenePhase) private var phase

  init() {
    do {
      if UserDefaults.standard.string(forKey: "appearance") == nil {
        let existed = FileManager.default.fileExists(
          atPath: URL.applicationSupportDirectory.appendingPathComponent("default.store").path)
        UserDefaults.standard.set(existed ? "dark" : "system", forKey: "appearance")
      }
      let schema = Schema(versionedSchema: CollectSchema.self)
      let preview = ProcessInfo.processInfo.arguments.contains("--ui-testing")
      let container = try ModelContainer(
        for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: preview))
      guard let value = Bundle.main.object(forInfoDictionaryKey: "CollectAPIURL") as? String,
        let url = URL(string: value), url.scheme == "https"
      else {
        throw APIError(status: 0, message: "应用的服务地址配置无效")
      }
      let library: LibraryStore
      #if DEBUG
        if preview {
          library = LibraryStore(
            container: container,
            api: APIClient(
              baseURL: url,
              transport: PreviewTransport(
                progress: ProcessInfo.processInfo.arguments.contains("--resume-reading") ? 100 : 0)),
            restoreSession: false)
          library.session = SavedSession(
            token: "local-preview",
            account: Account(id: "preview", name: "阅读者", email: "preview@example.invalid"))
        } else {
          library = LibraryStore(container: container, api: APIClient(baseURL: url))
        }
      #else
        library = LibraryStore(container: container, api: APIClient(baseURL: url))
      #endif
      _store = State(initialValue: library)
      _startupError = State(initialValue: nil)
    } catch {
      _store = State(initialValue: nil)
      _startupError = State(initialValue: error.localizedDescription)
    }
  }

  var body: some Scene {
    WindowGroup {
      Group {
        if let store {
          Group {
            if store.session != nil { LibraryView() } else { AuthenticationView() }
          }
          .environment(store)
          .task {
            for await path in NWPathMonitor() {
              if Task.isCancelled { break }
              if path.status == .satisfied { await store.sync() }
            }
          }
          .task(id: store.session?.account.id) {
            await BackgroundDownloads.shared.restore()
            await store.sync()
          }
        } else {
          ContentUnavailableView(
            "无法打开本地资料", systemImage: "externaldrive.badge.exclamationmark",
            description: Text(startupError ?? "请重新启动应用后重试"))
        }
      }
      .preferredColorScheme(appearance == "system" ? nil : appearance == "light" ? .light : .dark)
      .tint(.orange)
      .onChange(of: phase) { _, value in
        if value == .active { Task { await store?.sync() } }
        if value == .background {
          let request = BGAppRefreshTaskRequest(identifier: "com.example.collect.refresh")
          request.earliestBeginDate = .now.addingTimeInterval(3600)
          do { try BGTaskScheduler.shared.submit(request) } catch
          { /* Foreground synchronization remains available when scheduling is denied. */  }
        }
      }
    }
    .backgroundTask(.appRefresh("com.example.collect.refresh")) {
      await store?.sync()
    }
    .backgroundTask(.urlSession(BackgroundDownloads.identifier)) {
      await BackgroundDownloads.shared.handleBackgroundEvents()
    }
  }
}
