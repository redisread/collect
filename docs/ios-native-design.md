# Collect 原生 iPhone 设计记录

用户已确认完整范围和工程组织方案，进入实施阶段。

## 已确认

- 移动端改为原生 iOS 应用，首版仅适配 iPhone。
- 删除 Android 工程，以 Swift 原生实现替换现有 Flutter 客户端。
- 界面使用 SwiftUI，应用代码不使用 UIKit，不引入外部 Swift 包。
- SwiftData 保存本地文章、离线内容与待同步操作。
- 继续使用 Collect 账号和 Cloudflare API，与 Web 同步订阅及阅读状态。
- 保留文件夹、未分类、未读数、收藏和稍后阅读，参考 Reeder 的列表层级、滑动操作、阅读排版和页面切换。
- 初版提供 OLED 深色模式，后续按[阅读与个人设置改造](reader-settings-upgrade.md)增加浅色及跟随系统。
- 最低支持 iOS 26，正文使用系统 WebKit 的 SwiftUI WebView，保留图片、链接、列表、代码和双语排版。
- Widget 展示未读数量、最近文章和继续阅读入口。
- 用户明确取消通知功能。
- 离线预下载保留文章原有已读状态，用户主动打开正文时标记已读。
- 离线已读、收藏和稍后阅读操作保存到 SwiftData，联网后自动同步。
- 首版覆盖登录注册、订阅与文件夹管理、OPML 导入导出、搜索、全文阅读、翻译与双语视图、收藏、稍后阅读、离线缓存和 Widget。
- 用户确认首版移除 ActivityKit 与动态岛，采用应用内同步进度，保留 WidgetKit。
- 离线能力默认启用，自动缓存全库最近 100 篇未读文章的正文和图片，保留收藏和稍后阅读文章的离线内容。
- 每次同步补充缓存，阅读过的普通文章缓存保留 30 天，设置提供缓存数量调整与清理。
- 同步交互参考 Reeder 已公开的行为，在应用内显示同步阶段和抓取数量，刷新完成后统一呈现新条目，保持阅读位置稳定。
- 同步条目与离线文件缓存分别记录完成状态，正文与所需图片落盘后才显示为可离线阅读。
- 跨设备按字段检测同步冲突，冲突时保留服务端当前状态，在应用内提示未应用的离线修改。
- 同步单篇文章阅读进度，重新打开时恢复位置，订阅列表滚动位置在 iPhone 本地保存。
- Wi-Fi 和蜂窝网络采用相同的正文及图片自动缓存策略。
- 完全移除 Flutter、Dart 及 Android 工程和对应构建配置，移动端仅保留原生 iOS 工程。
- 原生客户端首次登录后重新同步服务端数据并建立离线缓存，旧 Flutter 本地缓存按可重新下载数据处理。

后续设置入口与刷新时机按[增量同步设计](ios-incremental-sync.md)执行。

## 工程组织建议

沿用 mobile 作为移动端根目录，按功能组织 Swift 文件。主应用与 Widget 使用各自的 Xcode target，共享代码仅包含双方实际使用的数据契约与存储读取能力。

```text
mobile/
  Collect.xcodeproj/
  Collect/
    App/
    Features/
      Authentication/
      Subscriptions/
      Articles/
      Reader/
      Search/
      Offline/
      Settings/
    Infrastructure/
      Networking/
      Persistence/
      Sync/
    DesignSystem/
    Resources/
  Shared/
  CollectWidgets/
  CollectTests/
  CollectUITests/
```

- 主应用负责网络同步与缓存写入，Widget 通过 App Group 读取最小共享快照并提供深链接。
- SwiftData 按账号隔离数据和待同步操作，凭据存储于 Keychain，正文及图片文件保存于缓存目录。
- 后台文件传输采用系统后台 URLSession 与 SwiftUI 生命周期入口，保存任务清单，处理网络中断、取消、失败与系统终止后的恢复。
- Swift 6.4 严格并发检查，单元与集成测试采用 Swift Testing，UI 测试采用 XCTest。
- 为默认离线预取、按字段冲突检测和阅读进度同步补齐必要的服务端接口契约，具体数据库变更在实现前审查。
- 更新移动端开发文档和 CI，完成验证后按 AGENTS.md 创建 PR、两轴独立审查并判断合并。

## 已核查约束

- 本机为 Xcode 27.2、Swift 6.4.2、iOS SDK 27.2。
- 当前文章详情 GET 会标记已读，离线预取需要避免触发这一副作用。
- 当前服务端缺少文章变更版本和删除标记，需要结合离线同步方案评估接口调整。

## 参考

- [Reeder](https://reederapp.com/)
- [Apple 的 SwiftUI WebKit 示例](https://developer.apple.com/documentation/webkit/building-a-cross-platform-web-browser)
- [离线缓存与 Live Activity 调研](ios-offline-live-activity-research.md)

### 目录直接导航

- 点击目录图标、名称或未读数直接打开该目录的文章列表，未分类采用相同交互。
- 右侧独立箭头只展开或收起订阅源，点击订阅源仍直接查看其文章。
- 不再显示“查看文件夹文章”或“查看未分类文章”入口行。
- 保留目录和订阅源的未读数，以及长按管理文件夹、管理订阅、移动订阅和全部标为已读。
