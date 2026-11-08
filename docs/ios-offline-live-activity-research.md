# Collect iPhone 离线缓存与 Live Activity 调研

调研日期为 2026-11-08。本文用于 Q12 产品决策，状态为待用户确认。研究依据为 Apple 文档、WWDC、Reeder 官网、开发者公告及 App Store 开发者版本记录。本文未进行真机测试，也未验证 Reeder 内部代码。

## 既定范围

Collect 原生 iPhone 客户端采用 SwiftUI、SwiftData、Swift 6.4，最低 iOS 26，遵守禁用 UIKit 与外部 Swift 包的约束。默认缓存全库最近 100 篇未读文章正文及图片，收藏和稍后阅读保留，普通已读缓存保留 30 天。Widget 展示未读和继续阅读。用户通知提醒关闭。以上为本次产品输入。

## Q12 建议

建议自动缓存默认只在应用内显示状态。用户希望离开应用后继续查看时，对当前有限批次提供一次性的“显示下载进度”操作，并说明会显示在锁定屏幕及支持设备的动态岛。该批次结束即结束 Live Activity。这个按钮代表本批次展示意图，未来自动缓存批次按默认方式执行。

这是产品判断。Apple HIG 鼓励可预期、有明确起止、与当前任务相关的 Live Activity，也允许符合用户预期的自动启动。HIG 要求在相关页面提供停止展示的控制，因此“每次必须再按一次按钮”并非通用平台规定。Collect 的日常预取频繁、通常无需等待结果，显式选择更符合低打扰阅读体验。[Apple Live Activities HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)

建议保留原 Q12 的显式选择方向，调整文案以覆盖锁屏。按钮只控制展示，后台下载能力由下载机制实现。任务结束、取消、等待重试和部分失败须准确表达，待下载总数固定在批次开始时，完成正文及该文所需图片后才计为一篇“可离线”。后续新文章进入下一批次，避免进度分母不断增加。这些为 Collect 的实施建议。

## Apple 平台依据

### 生命周期与更新

- ActivityKit 的界面由 WidgetKit 和 SwiftUI 实现，通常从前台请求启动，可在获得后台运行时间时更新及结束。Live Activity 自身无法访问网络。应在已有下载回调或获准执行期间更新，后台执行机会会影响进度及时性。[Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- 通常最长活动时间为 8 小时，结束后锁屏可再保留至多 4 小时。任务结束时应调用结束 API，动态岛随之移除。Collect 的下载结果建议立即移除或短暂保留，以应用内结果为最终记录。8 小时属于生命周期上限，Apple 文档没有为缓存任务规定“超过多少秒才适合 Live Activity”的统一准入门槛。[Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- 状态变化时再更新。按完成篇数、阶段变化、失败或结束合并更新即可。若采用本地更新，使用 `pushType: nil`，状态陈旧时利用 `staleDate` 与陈旧展示反馈。此方式无需引入服务端 ActivityKit 推送。[Meet ActivityKit](https://developer.apple.com/videos/play/wwdc2023/10184/)
- Apple 对高优先级 ActivityKit 推送有每小时预算和节流，并提供频繁推送设置。文档未公布适用于所有应用的固定每秒次数。本地下载进度无需为此请求频繁推送权限。[Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)

### 权限与无通知提醒

ActivityKit 默认允许应用启动、更新和结束 Live Activity，用户可在设置中禁用。启动前检查 `ActivityAuthorizationInfo().areActivitiesEnabled`，并处理启动失败及授权变化。普通通知提醒授权和 Live Activities 设置分别管理。Collect 可采用本地 ActivityKit 更新，并省略 `AlertConfiguration`，维持无主动声音及提醒更新的产品意图。用户禁用 Live Activities 后，应用内进度仍提供任务状态。[ActivityAuthorizationInfo](https://developer.apple.com/documentation/activitykit/activityauthorizationinfo) [Meet ActivityKit](https://developer.apple.com/videos/play/wwdc2023/10184/)

上述“无通知提醒”建议解释为应用不发送新闻、完成等主动提醒，用户主动开启的持续状态展示仍可存在。若用户希望完全没有锁屏或系统状态展示，需要进一步选择应用内进度方案。系统对 Live Activities 的授权交互及后台任务提示由 iOS 控制，具体首次开启、取消及锁屏表现应在 iOS 26 真机验证。

### 后台下载与后台执行

| 工作 | 官方机制及约束 | Collect 建议 |
| --- | --- | --- |
| 正文、图片文件传输 | 后台 `URLSession` 可由系统独立进程传输，应用挂起后仍可进行，系统终止后可重建同标识会话 | 使用下载任务和持久化清单，把下载完成文件移入缓存目录，再提交可离线状态 |
| 自动获取最新文章清单 | `BGAppRefreshTask` 由系统择机调度 | 用于机会性刷新及补充下载计划，前台启动时也补齐 |
| 清理、维护或更长自动处理 | `BGProcessingTask` 由系统调度，可指定联网等要求 | 适用于缓存维护与补齐，按批次保存进度并响应过期 |
| 用户主动要求立刻完成的较长工作 | iOS 26 `BGContinuedProcessingTask` 从前台用户动作开始，系统展示任务进度并可取消 | 只有另行设计“立即准备离线阅读”明确任务且确需持续处理时再考虑 |

后台 `URLSession` 支持非紧急下载的 `isDiscretionary`，系统可等到更合适的网络和电源条件。后台新发起的传输会按 discretionary 处理。Apple 建议少量会话、批量安排已知下载任务，避免每次完成一项再唤醒应用发下一项导致限流延迟。正文解析后才知道图片链接的依赖，应持久化阶段并在可运行时安排下一批。[Downloading files in the background](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)

系统掌握后台运行时机，低电量、网络和资源状态等均会影响调度。持续处理任务也可能到期或终止。Collect 应提供断点、幂等重试、失败数量和下一次恢复入口，并根据实际文件落盘情况呈现完成状态。[Finish tasks in the background](https://developer.apple.com/videos/play/wwdc2025/227/)

`BGContinuedProcessingTask` 要求任务由当次明确用户动作发起。Apple 明确排除自动维护、备份、同步等自动工作，即使用户以前开启过相关偏好。系统以 Live Activity 显示任务标题、进度和取消控制，应用必须报告真实 `Progress` 并处理过期及完成。默认可排队，也能选择无法立即运行时失败的提交策略。[Performing long-running tasks on iOS and iPadOS](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados) [BGContinuedProcessingTask](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask)

因此，自动缓存采用后台 URLSession 与择机刷新更合适。单纯“显示下载进度”按钮应仅启动展示，若需要 Continued Processing，应把用户动作定义为当下开始准备离线内容，并使用系统提供的任务进度界面。为同一任务同时叠加自定义 ActivityKit 展示会增加重复状态，这是应避免的产品设计。

### SwiftUI only 与版本

- ActivityKit 的 SwiftUI/WidgetKit 展示、Foundation 下载与 BackgroundTasks 均为系统框架。实现这些功能可遵守无外部 Swift 包约束。ActivityKit 从 iOS 16.1 可用，既定 iOS 26 下限涵盖所需基础 API。[ActivityAuthorizationInfo](https://developer.apple.com/documentation/activitykit/activityauthorizationinfo) [Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- SwiftUI 从 iOS 16 提供 `.backgroundTask(.urlSession(identifier))` 接收后台会话事件，可配合 Foundation 的 `URLSessionDownloadDelegate`。应沿 SwiftUI 生命周期接入，Foundation 文档中的 UIApplicationDelegate 示例需要替换为 SwiftUI 对应入口。[SwiftUI BackgroundTask.urlSession](https://developer.apple.com/documentation/swiftui/backgroundtask/urlsession(_:))
- `BGContinuedProcessingTask` 属于 iOS 26 新 API，WWDC 示例直接通过 BackgroundTasks 注册和提交。持续处理任务允许在用户触发时动态注册，普通后台任务则要在启动期间注册。`UIApplication.beginBackgroundTask` 属于 UIKit，遵守现有约束时应采用前述系统框架路径。[Finish tasks in the background](https://developer.apple.com/videos/play/wwdc2025/227/)
- Apple 当前网页可能包含较新系统新增 API。本建议只依赖上述已覆盖 iOS 26 的路径。Swift 6.4 下的隔离、delegate 与 SwiftData 写入边界仍需实现阶段编译及真机验证。

## Reeder 的公开证据

### 新版 Reeder

新版按时间线位置追踪阅读，iCloud 同步订阅、位置与带标签内容。官方 FAQ 明确等刷新完整结束后才显示新条目，以免抓取尚未结束时滚动位置跳动。可从 Settings → Diagnostics 找出慢订阅；Reader View 可按 feed 或 Links 集合配置。[Reeder 官网](https://reederapp.com/) [Reeder Help](https://reederapp.com/help/)

开发者在 2025-05-16 公告中确认新增删除旧时间线条目的设置，属于可核查的数据保留交互。该公告没有给出正文、图片离线预下载策略。[开发者更新公告](https://gloria.social/@rizzi/114518064890917284)

本次读取官网、完整 Help/FAQ、美国 App Store 当前页面及其可见开发者版本历史，并检查官网链接的开发者公开 RSS 公告，未发现可确认“离线缓存通过 Live Activity 展示”的官方说明。公开资料也未给出全正文与图片自动预缓存数量、触发时机、后台传输技术或 SwiftUI/UIKit 内部实现。上述能力仍属未知，需真机观察或开发者说明才能确定。[Reeder App Store](https://apps.apple.com/us/app/reeder/id6475002485) [开发者公告 RSS](https://gloria.social/@rizzi.rss)

### Reeder Classic

Classic 官网确认 iCloud feeds/read later、可按 feed 启用 Automatic Reader View、显示最近文章的 Widget，以及默认关闭的滚动标已读。Reader View 是阅读展示配置，官方该说明没有承诺提前下载所有提取正文和图片。[Reeder Classic 官网](https://reederapp.com/classic/)

开发者版本记录 5.0.13 明确初次 iCloud 同步时在应用标题栏显示抓取数量，连续批次没有新条目时显示 Fetching / Still fetching。5.4.1 说明 Reader View 默认使用 Readability，并增加 Postlight Parser 选项。这些记录证明公开的应用内反馈及正文提取选择，未公开它们的后台执行方式。此次可见开发者说明和版本历史中同样未找到 Live Activity 下载进度的明确说明。[Reeder Classic App Store](https://apps.apple.com/us/app/reeder-classic/id1529445840)

### 对 Collect 的启发

可参考 Reeder 的应用内同步状态、明确抓取数量与稳定阅读位置。Collect 保留既定未读与离线缓存模型，定义“正文和图片已落盘”的可离线状态，并避免用单纯同步完成来代表离线准备完成。Reeder 本次可验证的一手材料不足以替 Collect 决定 Q12，Live Activity 方案仍依据 Apple 平台要求与用户意图确定。

## 待选择方案

| 方案 | 交互 | 适用判断 |
| --- | --- | --- |
| A，建议 | 自动缓存应用内反馈，用户对当前批次选择“显示下载进度”，启动自定义本地 Live Activity | 保留动态岛能力，用户掌握出现时机 |
| B，最简 | 全部缓存状态留在应用内，Widget 继续承担未读和继续阅读 | 首版集中完成可靠离线阅读 |
| C，明确主动任务 | 单设“立即准备离线阅读”，评估 Continued Processing，并采用系统进度及取消 UI | 用户有当下完成批量离线准备的明确需要，且存在持续计算或处理工作 |

Q12 尚未确认。本文建议 A，后台传输采用系统后台 URLSession；C 作为后续明确主动任务的备选。进入实现前需验证后台挂起、授权关闭、用户取消、网络中断、系统终止后恢复，以及正文成功但部分图片失败时的状态一致性。本文交付为研究文档，运行与编译测试尚未执行。
