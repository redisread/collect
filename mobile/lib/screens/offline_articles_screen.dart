import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/offline_service.dart';
import '../models/article.dart';
import 'article_detail_screen.dart';

/// 离线文章列表页面
class OfflineArticlesScreen extends ConsumerStatefulWidget {
  const OfflineArticlesScreen({super.key});

  @override
  ConsumerState<OfflineArticlesScreen> createState() => _OfflineArticlesScreenState();
}

class _OfflineArticlesScreenState extends ConsumerState<OfflineArticlesScreen> {
  List<Article> _articles = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadCachedArticles();
  }

  Future<void> _loadCachedArticles() async {
    setState(() => _isLoading = true);
    try {
      final articles = await OfflineService.getAllCachedArticles();
      setState(() {
        _articles = articles;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      _showError('加载失败: $e');
    }
  }

  Future<void> _clearCache() async {
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (context) => CupertinoAlertDialog(
        title: const Text('确认清理'),
        content: const Text('确定要删除所有离线缓存的文章吗？'),
        actions: [
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await OfflineService.clearAllCache();
      await _loadCachedArticles();
      _showSuccess('已清理所有缓存');
    }
  }

  Future<void> _deleteArticle(Article article) async {
    await OfflineService.removeCachedArticle(article.id);
    await _loadCachedArticles();
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: const Text('离线阅读'),
        trailing: _articles.isNotEmpty
            ? CupertinoButton(
                padding: EdgeInsets.zero,
                child: const Icon(CupertinoIcons.trash),
                onPressed: _clearCache,
              )
            : null,
      ),
      child: _buildContent(),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (_articles.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              CupertinoIcons.download_circle,
              size: 64,
              color: CupertinoColors.systemGrey,
            ),
            const SizedBox(height: 16),
            const Text(
              '没有离线文章',
              style: TextStyle(
                fontSize: 17,
                color: CupertinoColors.systemGrey,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '收藏或下载文章以供离线阅读',
              style: TextStyle(
                fontSize: 14,
                color: CupertinoColors.systemGrey2,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator.adaptive(
      onRefresh: _loadCachedArticles,
      child: ListView.builder(
        itemCount: _articles.length,
        itemBuilder: (context, index) {
          final article = _articles[index];
          return _OfflineArticleCard(
            article: article,
            onTap: () => _openArticle(article),
            onDelete: () => _deleteArticle(article),
          );
        },
      ),
    );
  }

  void _openArticle(Article article) {
    Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => ArticleDetailScreen(articleId: article.id),
      ),
    );
  }

  void _showError(String message) {
    showCupertinoDialog(
      context: context,
      builder: (context) => CupertinoAlertDialog(
        title: const Text('错误'),
        content: Text(message),
        actions: [
          CupertinoDialogAction(
            child: const Text('确定'),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  void _showSuccess(String message) {
    // 使用 SnackBar 风格的提示
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (context) => Positioned(
        bottom: 100,
        left: MediaQuery.of(context).size.width * 0.2,
        width: MediaQuery.of(context).size.width * 0.6,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey2.withOpacity(0.9),
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
}

/// 离线文章卡片
class _OfflineArticleCard extends StatelessWidget {
  final Article article;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _OfflineArticleCard({
    required this.article,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(article.id),
      direction: DismissDirection.endToStart,
      background: Container(
        color: CupertinoColors.systemRed,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(
          CupertinoIcons.delete,
          color: CupertinoColors.white,
        ),
      ),
      onDismissed: (_) => onDelete(),
      child: CupertinoButton(
        padding: EdgeInsets.zero,
        onPressed: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: CupertinoColors.separator.resolveFrom(context),
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                article.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: CupertinoColors.label,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (article.summary?.isNotEmpty ?? false) ...[
                const SizedBox(height: 4),
                Text(
                  article.summary!,
                  style: TextStyle(
                    fontSize: 14,
                    color: CupertinoColors.systemGrey.resolveFrom(context),
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    CupertinoIcons.arrow_down_circle_fill,
                    size: 14,
                    color: CupertinoColors.systemGreen.resolveFrom(context),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '已下载',
                    style: TextStyle(
                      fontSize: 12,
                      color: CupertinoColors.systemGreen.resolveFrom(context),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      article.url,
                      style: TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.systemGrey2.resolveFrom(context),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
