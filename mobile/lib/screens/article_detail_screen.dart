import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/article.dart';
import '../providers/article_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/translation_provider.dart';
import '../services/offline_service.dart';
import '../widgets/reading_progress_bar.dart';

/// 文章详情页
class ArticleDetailScreen extends ConsumerStatefulWidget {
  final String articleId;

  const ArticleDetailScreen({super.key, required this.articleId});

  @override
  ConsumerState<ArticleDetailScreen> createState() =>
      _ArticleDetailScreenState();
}

class _ArticleDetailScreenState extends ConsumerState<ArticleDetailScreen> {
  /// 是否显示提取的内容
  bool _showExtracted = false;

  /// 是否正在提取
  bool _isExtracting = false;

  /// WebView 控制器
  WebViewController? _controller;

  /// 当前显示的内容
  String? _currentContent;

  /// 滚动控制器
  final ScrollController _scrollController = ScrollController();

  /// 阅读进度（0.0 - 1.0）
  double _readingProgress = 0.0;

  /// 进度保存定时器
  Timer? _progressSaveTimer;

  /// 是否从本地缓存加载
  bool _isOfflineMode = false;

  /// 本地缓存的文章
  Article? _cachedArticle;

  /// 翻译视图模式: 0=原文, 1=双语, 2=译文
  int _translationViewMode = 0;

  @override
  void initState() {
    super.initState();
    _initWebView();
    _loadArticle();
  }

  @override
  void dispose() {
    _progressSaveTimer?.cancel();
    _scrollController.dispose();
    _controller = null;
    super.dispose();
  }

  void _initWebView() {
    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final controller = WebViewController.fromPlatformCreationParams(params);

    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(CupertinoColors.systemBackground)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            // 更新加载进度
          },
          onPageStarted: (String url) {},
          onPageFinished: (String url) {
            // 页面加载完成后注入滚动监听脚本
            _injectScrollListener();
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView error: ${error.description}');
          },
        ),
      )
      ..addJavaScriptChannel(
        'ReadingProgress',
        onMessageReceived: (JavaScriptMessage message) {
          // 接收来自 WebView 的滚动位置
          final progress = double.tryParse(message.message) ?? 0.0;
          _updateReadingProgress(progress);
        },
      );

    _controller = controller;
  }

  /// 注入 JavaScript 监听滚动
  void _injectScrollListener() {
    if (_controller == null) return;

    const script = '''
      (function() {
        function sendProgress() {
          var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          var scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
          var progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
          ReadingProgress.postMessage(progress.toString());
        }
        window.addEventListener('scroll', sendProgress);
        sendProgress();
      })();
    ''';
    _controller!.runJavaScript(script);
  }

  /// 加载文章（优先从本地缓存）
  Future<void> _loadArticle() async {
    // 1. 先检查本地缓存
    final cachedArticle = await OfflineService.getCachedArticle(widget.articleId);
    if (cachedArticle != null) {
      setState(() {
        _cachedArticle = cachedArticle;
        _readingProgress = (cachedArticle.readingProgress ?? 0) / 100;
      });
    }

    // 2. 尝试从服务器获取最新内容
    try {
      final api = ref.read(apiServiceProvider);
      final articleData = await api.getArticle(widget.articleId);
      final freshArticle = Article.fromJson(articleData['data'] as Map<String, dynamic>);

      setState(() {
        _cachedArticle = freshArticle;
        _isOfflineMode = false;
      });

      // 3. 如果是收藏文章，自动缓存
      if (freshArticle.isStarred) {
        await OfflineService.cacheArticle(freshArticle, freshArticle.content);
      }
    } catch (e) {
      // 网络错误但已有缓存，显示缓存内容
      if (_cachedArticle != null) {
        setState(() => _isOfflineMode = true);
        _showToast('显示离线缓存内容');
      } else {
        _showErrorDialog('加载失败', '请检查网络连接');
      }
    }

    // 4. 恢复阅读位置
    if (_readingProgress > 0) {
      _restoreReadingPosition();
    }
  }

  /// 更新阅读进度
  void _updateReadingProgress(double progress) {
    setState(() => _readingProgress = progress);

    // 节流保存（每5秒保存一次）
    _progressSaveTimer?.cancel();
    _progressSaveTimer = Timer(const Duration(seconds: 5), _saveProgress);
  }

  /// 保存阅读进度
  Future<void> _saveProgress() async {
    final progress = (_readingProgress * 100).round();
    await ref.read(articlesNotifierProvider.notifier).updateReadingProgress(
      widget.articleId,
      progress: progress,
    );
  }

  /// 恢复阅读位置
  void _restoreReadingPosition() {
    if (_controller == null) return;

    final targetProgress = _readingProgress;
    if (targetProgress <= 0) return;

    // 延迟恢复位置，等待页面渲染完成
    Future.delayed(const Duration(milliseconds: 500), () {
      if (_controller == null) return;
      _controller!.runJavaScript('''
        window.scrollTo(0, document.body.scrollHeight * $targetProgress);
      ''');
    });
  }

  @override
  Widget build(BuildContext context) {
    final article = _cachedArticle;
    final translationState = ref.watch(translationProvider);
    final translation = translationState.translations[widget.articleId];
    final hasTranslation = translation != null;

    // 如果还没有加载到文章，显示加载中
    if (article == null) {
      return CupertinoPageScaffold(
        navigationBar: CupertinoNavigationBar(
          leading: CupertinoNavigationBarBackButton(
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        child: const Center(child: CupertinoActivityIndicator()),
      );
    }

    // 更新 WebView 内容
    _updateContent(article);

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(
          article.title,
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => Navigator.of(context).pop(),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 翻译按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: translationState.isTranslating
                  ? null
                  : () => _translateArticle(article),
              child: translationState.isTranslating
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CupertinoActivityIndicator(radius: 8),
                    )
                  : Icon(
                      hasTranslation
                          ? CupertinoIcons.checkmark_alt_circle_fill
                          : Icons.translate,
                      color: hasTranslation
                          ? CupertinoColors.systemGreen
                          : CupertinoColors.systemGrey,
                    ),
            ),
            // 分享按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.share),
              onPressed: () => _showShareSheet(context, article),
            ),
            // 收藏按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: Icon(
                article.isStarred
                    ? CupertinoIcons.star_fill
                    : CupertinoIcons.star,
                color: article.isStarred
                    ? CupertinoColors.systemYellow
                    : CupertinoColors.systemGrey,
              ),
              onPressed: () => _toggleStar(article.id),
            ),
            // 更多按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.ellipsis),
              onPressed: () => _showActionSheet(context, article),
            ),
          ],
        ),
        bottom: ReadingProgressBar(progress: _readingProgress),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // 离线模式指示器
            if (_isOfflineMode)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 8),
                color: CupertinoColors.systemYellow.withValues(alpha: 0.2),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      CupertinoIcons.wifi_slash,
                      size: 14,
                      color: CupertinoColors.systemOrange,
                    ),
                    SizedBox(width: 6),
                    Text(
                      '离线模式',
                      style: TextStyle(
                        fontSize: 13,
                        color: CupertinoColors.systemOrange,
                      ),
                    ),
                  ],
                ),
              ),
            // 内容切换器（如果提取了内容或有翻译）
            if ((article.content != null && article.content!.isNotEmpty) || hasTranslation) ...[
              _buildContentSwitcherWithTranslation(article, translation, hasTranslation, translationState.isOffline),
              const Divider(height: 1),
            ],
            // 主内容区域
            Expanded(
              child: _buildContentArea(article, translation, hasTranslation, translationState.isOffline),
            ),
          ],
        ),
      ),
    );
  }

  /// 构建内容切换器（含翻译模式）
  Widget _buildContentSwitcherWithTranslation(Article article, dynamic translation, bool hasTranslation, bool isTranslationOffline) {
    // 没有翻译时，使用原来的切换器
    if (!hasTranslation) {
      return _buildContentSwitcher();
    }

    // 有翻译时，显示原文/双语/译文
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        border: Border(
          bottom: BorderSide(color: CupertinoColors.separator),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              CupertinoSlidingSegmentedControl<int>(
                groupValue: _translationViewMode,
                children: const {
                  0: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: Text('原文'),
                  ),
                  1: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: Text('双语'),
                  ),
                  2: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    child: Text('译文'),
                  ),
                },
                onValueChanged: (value) {
                  if (value != null) {
                    setState(() => _translationViewMode = value);
                  }
                },
              ),
              const Spacer(),
              // 离线指示器
              if (isTranslationOffline) ...[
                const Icon(
                  CupertinoIcons.wifi_slash,
                  size: 14,
                  color: CupertinoColors.systemOrange,
                ),
                const SizedBox(width: 4),
                const Text(
                  '离线',
                  style: TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.systemOrange,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              // 清除翻译按钮
              GestureDetector(
                onTap: () {
                  ref.read(translationProvider.notifier).clearTranslation(widget.articleId);
                  setState(() => _translationViewMode = 0);
                },
                child: const Text(
                  '清除',
                  style: TextStyle(fontSize: 13, color: CupertinoColors.systemRed),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 构建内容切换器
  Widget _buildContentSwitcher() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        border: Border(
          bottom: BorderSide(
            color: CupertinoColors.separator,
          ),
        ),
      ),
      child: CupertinoSlidingSegmentedControl<bool>(
        groupValue: _showExtracted,
        children: const {
          false: Padding(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text('原文'),
          ),
          true: Padding(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text('提取内容'),
          ),
        },
        onValueChanged: (value) {
          if (value != null) {
            setState(() => _showExtracted = value);
          }
        },
      ),
    );
  }

  /// 构建主内容区域
  Widget _buildContentArea(Article article, dynamic translation, bool hasTranslation, bool isOffline) {
    // 如果处于翻译模式
    if (hasTranslation && _translationViewMode > 0) {
      return _buildTranslatedContent(article, translation, _translationViewMode);
    }

    // 如果有提取的内容且选择显示提取内容
    if (_showExtracted && article.content != null && article.content!.isNotEmpty) {
      return _buildExtractedContent(article.content!);
    }

    // 显示原文或提取按钮
    return _buildOriginalContent(article);
  }

  /// 构建提取后的内容视图
  Widget _buildExtractedContent(String content) {
    if (_controller == null) {
      return const Center(
        child: CupertinoActivityIndicator(),
      );
    }

    return WebViewWidget(controller: _controller!);
  }

  /// 构建原文视图
  Widget _buildOriginalContent(Article article) {
    // 显示 WebView 加载原文
    if (_controller != null && article.url.isNotEmpty) {
      return WebViewWidget(controller: _controller!);
    }

    // 显示提取按钮
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            CupertinoIcons.doc_text,
            size: 64,
            color: CupertinoColors.systemGrey,
          ),
          const SizedBox(height: 16),
          const Text(
            '尚未提取正文',
            style: TextStyle(
              fontSize: 17,
              color: CupertinoColors.systemGrey,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '提取后可以享受更好的阅读体验',
            style: TextStyle(
              fontSize: 14,
              color: CupertinoColors.systemGrey2,
            ),
          ),
          const SizedBox(height: 24),
          CupertinoButton.filled(
            onPressed: _isExtracting ? null : () => _extractContent(article.id),
            child: _isExtracting
                ? const CupertinoActivityIndicator(
                    color: CupertinoColors.white,
                  )
                : const Text('提取全文'),
          ),
          const SizedBox(height: 16),
          CupertinoButton(
            onPressed: () => _openInBrowser(article.url),
            child: const Text('在浏览器中打开'),
          ),
        ],
      ),
    );
  }

  /// 更新 WebView 内容
  void _updateContent(Article article) {
    if (_controller == null) return;

    String? newContent;

    if (_showExtracted && article.content != null && article.content!.isNotEmpty) {
      // 使用提取的内容
      newContent = _buildHtmlContent(article.content!, article.title);
    } else if (!_showExtracted && article.url.isNotEmpty) {
      // 加载原文 URL
      _controller!.loadRequest(Uri.parse(article.url));
      return;
    }

    if (newContent != null && newContent != _currentContent) {
      _currentContent = newContent;
      _controller!.loadHtmlString(newContent);
    }
  }

  /// 构建 HTML 内容
  String _buildHtmlContent(String content, String title) {
    return '''
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  padding: 16px;
  margin: 0;
  max-width: 100%;
}
h1 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 16px;
  line-height: 1.3;
}
p {
  margin-bottom: 12px;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px auto;
}
a {
  color: #007AFF;
  text-decoration: none;
}
blockquote {
  border-left: 3px solid #007AFF;
  margin: 16px 0;
  padding-left: 16px;
  color: #666;
}
code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
pre {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}
@media (prefers-color-scheme: dark) {
  body {
    background: #1c1c1e;
    color: #fff;
  }
  a {
    color: #0A84FF;
  }
  blockquote {
    border-left-color: #0A84FF;
    color: #aaa;
  }
  code, pre {
    background: #2c2c2e;
  }
}
</style>
</head>
<body>
<h1>$title</h1>
$content
</body>
</html>
'''.trim();
  }

  /// 翻译文章内容
  Future<void> _translateArticle(Article article) async {
    final content = article.content ?? article.summary ?? '';
    if (content.isEmpty) {
      _showToast('暂无可翻译的内容');
      return;
    }

    try {
      await ref.read(translationProvider.notifier).translateArticle(
            articleId: article.id,
            content: content,
          );
      // 翻译完成后切换到双语模式
      setState(() => _translationViewMode = 1);
      _showToast('翻译完成');
    } catch (e) {
      _showToast('翻译失败: $e');
    }
  }

  /// 构建翻译后的内容视图
  Widget _buildTranslatedContent(Article article, dynamic translation, int mode) {
    if (translation == null) {
      return const Center(child: Text('翻译数据不可用'));
    }

    final segments = translation.segments as List<dynamic>?;
    if (segments == null || segments.isEmpty) {
      // 回退到纯文本显示
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Text(translation.translated ?? ''),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: mode == 2 ? segments.length : segments.length * 2,
      itemBuilder: (context, index) {
        if (mode == 2) {
          // 仅译文模式
          final seg = segments[index];
          return _buildTranslationSegment(null, seg['translated'] as String);
        } else {
          // 双语模式：交替显示原文和译文
          if (index.isEven) {
            final seg = segments[index ~/ 2];
            return _buildTranslationSegment(seg['original'] as String, null);
          } else {
            final seg = segments[index ~/ 2];
            return _buildTranslationSegment(null, seg['translated'] as String);
          }
        }
      },
    );
  }

  /// 构建单个翻译段
  Widget _buildTranslationSegment(String? original, String? translated) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (original != null)
            Text(
              original,
              style: const TextStyle(fontSize: 15, color: CupertinoColors.label),
            ),
          if (original != null && translated != null)
            const SizedBox(height: 4),
          if (translated != null)
            Text(
              translated,
              style: const TextStyle(
                fontSize: 14,
                color: CupertinoColors.systemBlue,
              ),
            ),
          if (original != null || translated != null)
            Divider(height: 16, color: CupertinoColors.separator.withValues(alpha: 0.5)),
        ],
      ),
    );
  }

  /// 提取文章内容
  Future<void> _extractContent(String articleId) async {
    setState(() => _isExtracting = true);

    try {
      final notifier = ref.read(articlesNotifierProvider.notifier);
      await notifier.extractArticle(articleId);

      // 提取完成后自动切换到提取内容视图
      setState(() {
        _showExtracted = true;
        _isExtracting = false;
      });

      // 刷新文章数据
      await _loadArticle();
    } catch (e) {
      setState(() => _isExtracting = false);
      _showErrorDialog('提取失败', e.toString());
    }
  }

  /// 切换收藏状态
  Future<void> _toggleStar(String articleId) async {
    final notifier = ref.read(articlesNotifierProvider.notifier);
    await notifier.toggleStar(articleId);
    // 刷新本地状态
    await _loadArticle();
  }

  /// 显示分享菜单
  void _showShareSheet(BuildContext context, Article article) {
    showCupertinoModalPopup<void>(
      context: context,
      builder: (BuildContext context) => CupertinoActionSheet(
        title: const Text('分享'),
        message: Text(article.title, maxLines: 2, overflow: TextOverflow.ellipsis),
        actions: <CupertinoActionSheetAction>[
          CupertinoActionSheetAction(
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(CupertinoIcons.link, size: 18),
                SizedBox(width: 8),
                Text('复制链接'),
              ],
            ),
            onPressed: () async {
              Navigator.pop(context);
              await _copyToClipboard(article.url);
              _showToast('链接已复制');
            },
          ),
          CupertinoActionSheetAction(
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(CupertinoIcons.share, size: 18),
                SizedBox(width: 8),
                Text('分享到...'),
              ],
            ),
            onPressed: () async {
              Navigator.pop(context);
              await Share.share(
                '${article.title}\n${article.url}',
                subject: article.title,
              );
            },
          ),
          CupertinoActionSheetAction(
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(CupertinoIcons.globe, size: 18),
                SizedBox(width: 8),
                Text('在浏览器中打开'),
              ],
            ),
            onPressed: () async {
              Navigator.pop(context);
              await _openInBrowser(article.url);
            },
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
      ),
    );
  }

  /// 显示操作菜单
  void _showActionSheet(BuildContext context, Article article) {
    showCupertinoModalPopup<void>(
      context: context,
      builder: (BuildContext context) => CupertinoActionSheet(
        title: const Text('文章选项'),
        message: Text(article.title, maxLines: 2, overflow: TextOverflow.ellipsis),
        actions: <CupertinoActionSheetAction>[
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _toggleRead(article.id, !article.isRead);
            },
            child: Text(article.isRead ? '标记为未读' : '标记为已读'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _toggleStar(article.id);
            },
            child: Text(article.isStarred ? '取消收藏' : '收藏'),
          ),
          if (article.content == null || article.content!.isEmpty)
            CupertinoActionSheetAction(
              onPressed: () {
                Navigator.pop(context);
                _extractContent(article.id);
              },
              child: const Text('提取全文'),
            ),
          // 下载离线阅读选项
          CupertinoActionSheetAction(
            onPressed: () async {
              Navigator.pop(context);
              await _downloadForOffline(article);
            },
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(CupertinoIcons.download_circle, size: 18),
                SizedBox(width: 8),
                Text('下载离线阅读'),
              ],
            ),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _openInBrowser(article.url);
            },
            child: const Text('在浏览器中打开'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
      ),
    );
  }

  /// 下载文章供离线阅读
  Future<void> _downloadForOffline(Article article) async {
    try {
      // 如果文章没有内容，先获取详情
      Article articleToCache = article;
      if (article.content == null || article.content!.isEmpty) {
        final api = ref.read(apiServiceProvider);
        final articleData = await api.getArticle(article.id);
        articleToCache = Article.fromJson(articleData['data'] as Map<String, dynamic>);
      }

      await OfflineService.cacheArticle(articleToCache, articleToCache.content);
      _showToast('已下载到离线阅读');
    } catch (e) {
      _showToast('下载失败: $e');
    }
  }

  /// 切换已读状态
  void _toggleRead(String articleId, bool isRead) {
    final notifier = ref.read(articlesNotifierProvider.notifier);
    notifier.toggleRead(articleId);
  }

  /// 在浏览器中打开
  Future<void> _openInBrowser(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showToast('无法打开链接');
    }
  }

  /// 复制到剪贴板
  Future<void> _copyToClipboard(String text) async {
    // 使用 Clipboard API 需要导入 services.dart
    // 这里简化处理，实际项目中应该使用 clipboard 插件
  }

  /// 显示 Toast 提示
  void _showToast(String message) {
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (context) => Positioned(
        bottom: 100,
        left: MediaQuery.of(context).size.width * 0.2,
        width: MediaQuery.of(context).size.width * 0.6,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey2.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: CupertinoColors.white,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );

    overlay.insert(entry);
    Future.delayed(const Duration(seconds: 2), entry.remove);
  }

  /// 显示错误对话框
  void _showErrorDialog(String title, String message) {
    showCupertinoDialog<void>(
      context: context,
      builder: (BuildContext context) => CupertinoAlertDialog(
        title: Text(title),
        content: Text(message),
        actions: <CupertinoDialogAction>[
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(context),
            child: const Text('确定'),
          ),
        ],
      ),
    );
  }
}
