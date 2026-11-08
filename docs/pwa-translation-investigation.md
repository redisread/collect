# 手机 PWA 翻译调查

调研日期为 2026-11-08。范围为现有 Google 免费入口、iOS 浏览器兼容性和可选服务。本记录结合代码检查与官方资料，手机真机根因仍待网络和控制台证据确认。

## 当前证据

- 当前服务端和浏览器都调用 `https://translate.googleapis.com/translate_a/single?client=gtx`。服务端默认四路段落并发、单次请求十秒超时、整篇六十秒超时。浏览器备用使用两路并发、单次请求三十秒超时，最多保存五百个成功段落到页面内存。两条路径遇到 429 或 5xx 均等待五百毫秒重试一次。依据为 [翻译实现](../api/src/lib/translate.ts)、[服务端路由](../api/src/routes/translate.ts)和[浏览器备用实现](../frontend/src/lib/translate-browser.ts)。
- 2026-11-08 主任务在生产页面复现 `/api/translate` 返回 502，界面显示 Google 限流。点击浏览器备用后，两条 `translate_a/single` 请求均失败，浏览器网络事件为 `net::ERR_FAILED`，CORS 原因为 `MissingAllowOriginHeader`。该浏览器的 `AbortSignal.any`、`timeout`、`throwIfAborted` 均存在。
- 同日主任务从当前主机以短文本及生产 Origin 发起请求，收到 302 跳转到 Google `/sorry/index`，随后为 429，未见 `Access-Control-Allow-Origin`。完整重定向地址含 IP 和查询参数，未纳入记录。该证据确认当前浏览器和主机出口遇到 Google 拦截及 CORS 响应问题；故障 iPhone 尚未取得同等网络记录，真机根因仍待确认。
- 用户已确认免费 Google 浏览器备用方案，官方计费 API 目前仅作为比较项。[阅读体验需求](reader-experience.md)

### 最小复现

以下命令仅发送公开测试文本 `Hello`，从当前主机执行得到 `Google minimal probe HTTP 429`，断言退出码为 1。该断言用于检测当前出口的失败，Google 风控状态随出口和时间变化。浏览器另行运行同一 URL 的 `fetch`，捕获结果为 `TypeError: Failed to fetch`，网络事件明确记录 `MissingAllowOriginHeader`。

```sh
translation_probe_status=$(curl -sSL --max-time 15 -o /dev/null -w '%{http_code}' \
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=Hello' \
  -H 'Origin: https://collect.jiahongw.com')
printf 'Google minimal probe HTTP %s\n' "$translation_probe_status"
test "$translation_probe_status" = 200
```

Service Worker 对跨源请求与 `/api/*` 直接放行，本次失败请求也实际到达 Google 域名。当前证据不支持由离线缓存拦截翻译的假设。[Service Worker](../frontend/public/sw.js)

整篇翻译使用 `Promise.all` 汇总段落，一个段落失败会使本次整篇结果失败。浏览器成功段落缓存仅存在页面内存，PWA 重载后需要重新请求。两者会放大长文和不稳定网络下的失败体验。[段落汇总](../api/src/lib/translate.ts) · [内存缓存](../frontend/src/lib/translate-browser.ts)

## 手机端需要区分的失败原因

| 候选原因 | 可以确认的事实 | 需要的现场证据 |
| --- | --- | --- |
| Web API 兼容性 | 共享实现直接调用 `AbortSignal.any()`。WebKit 在 Safari 17.4 加入该 API，缺失时会在发出请求前抛异常 | 故障设备版本、`typeof AbortSignal.any` 和异常堆栈 |
| Google 限流 | 当前代码可识别可读响应中的 429，固定重试一次 | 浏览器网络面板中的实际状态，确认成功响应与错误响应的 CORS 头 |
| CORS | 跨源响应需要通过 Fetch 的 CORS 检查。上游错误响应缺少允许头时，脚本可能只得到网络错误 | Network 与 Console 联合检查，记录状态、允许头和 Origin |
| 网络或超时 | 浏览器直连经过手机自己的网络，现有代码施加请求超时 | 同一手机、同一文章在 Safari 与独立 PWA 的结果，以及 Wi-Fi/蜂窝网络对照 |
| 旧资源或模块加载失败 | 浏览器翻译通过动态 import 加载共享实现 | 失败 chunk 的 URL、状态和应用版本，核对更新前后 |

兼容性依据为 WebKit 官方发布说明。Fetch 标准规定 `no-cors` 的 opaque 响应不向脚本暴露正文，因此无法用该模式读取翻译 JSON。PWA 的独立窗口身份本身不足以确定网络故障原因。[Safari 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/) · [Fetch 标准](https://fetch.spec.whatwg.org/#http-cors-protocol) · [WebKit Home Screen web apps](https://webkit.org/blog/13878/)

## Google 官方 API 的边界

官方 Basic v2 文档列出的翻译地址为 `POST https://translation.googleapis.com/language/translate/v2`，支持 HTML 和多个字符串。Basic 支持 API key，Advanced v3 使用身份凭据且不支持 API key。本次所查官方开发文档未给出当前 `translate_a/single?client=gtx` 入口的第三方接入契约、配额或服务保证，因此无法为它承诺稳定额度或把 Cloud Translation 配额套用到它。[Basic REST](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate) · [认证说明](https://docs.cloud.google.com/translate/docs/authentication)

Google 建议由服务端添加 API key 并发出请求。若以后选择官方 API，可沿用同源 `/api/translate`，在 Worker 管理凭据、缓存和用量。浏览器直接携带应用共享 key 会暴露凭据，Advanced 的服务账号凭据也应由服务端持有。[API key 最佳实践](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)

官方 NMT 定价提供每月前五十万字符的十美元抵扣，标准按需档超出部分为每百万字符二十美元。官方默认通用模型配额为每项目每分钟六百万字符、每日字符数不限，可调整配额控制使用量。免费抵扣用尽后的收费、项目启用及认证配置都需要纳入选择。[价格](https://cloud.google.com/products/translate/pricing) · [配额](https://docs.cloud.google.com/translate/quotas) · [设置](https://docs.cloud.google.com/translate/docs/setup)

## 方案比较

| 方案 | 成本与接入 | 能处理的范围 | 当前结论 |
| --- | --- | --- | --- |
| 修复现有浏览器免费备用 | 保留免密钥入口，优先修复实际复现的兼容性、加载或错误呈现问题 | 改善客户端可控故障；Google 可达性、响应 CORS 和限流仍由上游及网络决定 | 符合已确认偏好；本次仅分析。当前已复现的上游 CORS 问题无法仅由客户端补头解决 |
| Google Cloud Translation Basic，经 Worker | 每月免费抵扣及超额收费，配置项目与服务端凭据 | 获得文档化 API、配额、HTML 翻译契约，手机继续访问同源 API | 保留为后续选择，当前用户偏好不采用 |
| Cloudflare Workers AI M2M100，经 Worker | 每日一万 Neurons 免费额度；超额需付费计划。模型标价每百万输入和输出 tokens 各 0.342 美元 | 使用现有 Cloudflare 基础设施调用翻译模型，需要新增 AI binding、语言映射及质量验证 | 可作备选，尚未亲测语言质量、长文表现和项目实际额度 |

Cloudflare 官方列出 `@cf/meta/m2m100-1.2b` 为多语言翻译模型。免费额度由 Workers AI 用量共同消耗，不能直接换算为固定篇数。当前项目是否启用、账户是否有余量仍需另行核实。[模型](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/) · [Workers AI 价格](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## 后续验证建议

1. 在故障手机记录 iOS 版本、独立窗口状态、当前应用版本和第一条失败异常，先确认请求是否发出。
2. 用同一文章分别测服务端和浏览器备用，保留状态、耗时、错误类型及已完成段落数。观测记录避免保存文章正文和凭据。
3. 根据实际根因修复后，验证短文、长文、取消、失败重试和原文/双语/译文切换，确认成功段落可以复用。
4. 桌面浏览器验证与手机宽度模拟分别记录；iOS Safari 和已安装 PWA 的真机结果单独验收。
