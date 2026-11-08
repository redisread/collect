# Collect iPhone

原生 iPhone 阅读客户端，最低支持 iOS 26，采用 Swift 6.4、SwiftUI、SwiftData、WidgetKit 与系统 WebKit。

使用 Xcode 27.2 打开 `Collect.xcodeproj`，选择 iPhone 模拟器运行。

## 工程

- `Collect/Features` 按认证、订阅、列表、阅读、离线与设置组织界面。
- `Collect/Infrastructure` 管理 API、Keychain、SwiftData 与后台文件下载。
- `Shared` 保存主应用与 Widget 的共享快照契约。
- `CollectWidgets` 提供未读数量、最近文章与继续阅读。
- `CollectTests` 与 `CollectUITests` 分别使用 Swift Testing 和 XCTest。

`project.yml` 是工程配置源，修改后运行 `xcodegen generate --spec mobile/project.yml` 并提交生成的工程文件。应用运行时只使用系统框架。

## 构建配置

`COLLECT_API_URL` 配置 HTTPS API 地址，`COLLECT_APP_GROUP` 配置共享容器。现有 `com.example.collect` 标识沿用旧工程，真机安装和发布需要在 Xcode 配置开发团队、正式 Bundle ID 与对应 App Group。

正文与图片缓存默认启用。SwiftData 按账号保存文章目录、状态、正文与待同步操作，图片文件在账号隔离的缓存键下保存。后台下载由系统调度，实际文件齐备后才显示完整离线。

接口依赖 D1 迁移 `0006_native_article_versions.sql`。预下载使用 `/api/native/articles/:id`，状态写入使用带字段版本的条件 PATCH。冲突保留服务器状态并在应用内提示。
