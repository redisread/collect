import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/feed_list_tile.dart';
import '../widgets/article_card.dart';
import '../providers/feed_provider.dart';
import '../providers/article_provider.dart';
import '../services/offline_service.dart';
import 'search_screen.dart';
import 'offline_articles_screen.dart';

/// 主页：根据屏幕宽度显示单栏或双栏布局
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isWide = MediaQuery.of(context).size.width > 768;

    if (isWide) {
      return _buildWideLayout(context, ref);
    }
    return _buildNarrowLayout(context, ref);
  }

  Widget _buildWideLayout(BuildContext context, WidgetRef ref) {
    return CupertinoPageScaffold(
      child: Row(
        children: [
          SizedBox(
            width: 260,
            child: Container(
              decoration: BoxDecoration(
                border: Border(
                  right: BorderSide(
                    color: CupertinoColors.separator,
                  ),
                ),
              ),
              child: _buildFeedSidebar(ref, context),
            ),
          ),
          Expanded(child: _buildArticleList(context, ref)),
        ],
      ),
    );
  }

  Widget _buildNarrowLayout(BuildContext context, WidgetRef ref) {
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: Builder(
          builder: (context) => CupertinoButton(
            padding: EdgeInsets.zero,
            child: const Icon(CupertinoIcons.bars),
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        middle: const Text('Collect'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 搜索按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.search),
              onPressed: () => _openSearch(context),
            ),
            // 刷新按钮
            CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.refresh),
              onPressed: () => _refreshArticles(ref),
            ),
          ],
        ),
      ),
      child: Scaffold(
        drawer: Drawer(
          child: SafeArea(
            child: _buildFeedSidebar(ref, context),
          ),
        ),
        body: _buildArticleList(context, ref),
      ),
    );
  }

  Widget _buildFeedSidebar(WidgetRef ref, BuildContext context) {
    final feedsAsync = ref.watch(feedsProvider);
    return feedsAsync.when(
      data: (feeds) => CustomScrollView(
        slivers: [
          CupertinoSliverNavigationBar(
            largeTitle: const Text('订阅源'),
            trailing: CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.add),
              onPressed: () {
                // 添加订阅源
              },
            ),
          ),
          // 离线阅读入口
          SliverToBoxAdapter(
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              onPressed: () => _openOfflineArticles(context),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.download_circle,
                    color: CupertinoColors.activeBlue,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      '离线阅读',
                      style: TextStyle(
                        fontSize: 16,
                        color: CupertinoColors.label,
                      ),
                    ),
                  ),
                  FutureBuilder<int>(
                    future: OfflineService.getCachedCount(),
                    builder: (context, snapshot) =>
                      Text(
                        '${snapshot.data ?? 0} 篇',
                        style: TextStyle(
                          fontSize: 14,
                          color: CupertinoColors.systemGrey.resolveFrom(context),
                        ),
                      ),
                  ),
                  Icon(
                    CupertinoIcons.chevron_forward,
                    color: CupertinoColors.systemGrey3,
                    size: 16,
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Divider(
              height: 1,
              indent: 16,
              endIndent: 16,
              color: CupertinoColors.separator.resolveFrom(context),
            ),
          ),
          SliverList(
            delegate: SliverChildListDelegate([
              ...feeds.where((feed) => feed.folderId != null).map((feed) => FeedListTile(feed: feed)),
              ExpansionTile(
                initiallyExpanded: true,
                leading: const Icon(Icons.folder_outlined),
                title: const Text('未分类'),
                subtitle: Text('${feeds.where((feed) => feed.folderId == null).fold<int>(0, (sum, feed) => sum + feed.unreadCount)} 篇未读'),
                children: [
                  ListTile(title: const Text('查看全部文章'), onTap: () {
                    ref.read(selectedFeedIdProvider.notifier).state = null;
                    ref.read(uncategorizedSelectedProvider.notifier).state = true;
                  }),
                  ...feeds.where((feed) => feed.folderId == null).map((feed) => FeedListTile(feed: feed)),
                ],
              ),
            ]),
          ),
        ],
      ),
      loading: () => const Center(child: CupertinoActivityIndicator()),
      error: (e, _) => Center(
        child: Text(
          '错误：\$e',
          style: const TextStyle(color: CupertinoColors.systemRed),
        ),
      ),
    );
  }

  Widget _buildArticleList(BuildContext context, WidgetRef ref) {
    final articlesState = ref.watch(articlesNotifierProvider);

    if (articlesState.isLoading) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (articlesState.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              CupertinoIcons.exclamationmark_triangle,
              size: 48,
              color: CupertinoColors.systemRed.withOpacity(0.6),
            ),
            const SizedBox(height: 16),
            Text(
              '加载失败',
              style: TextStyle(
                fontSize: 17,
                color: CupertinoColors.systemGrey,
              ),
            ),
            const SizedBox(height: 8),
            CupertinoButton(
              onPressed: () => _refreshArticles(ref),
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (articlesState.articles.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              CupertinoIcons.doc_text,
              size: 64,
              color: CupertinoColors.systemGrey,
            ),
            const SizedBox(height: 16),
            const Text(
              '暂无文章',
              style: TextStyle(
                fontSize: 17,
                color: CupertinoColors.systemGrey,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '添加订阅源后开始阅读',
              style: TextStyle(
                fontSize: 14,
                color: CupertinoColors.systemGrey2,
              ),
            ),
            const SizedBox(height: 24),
            CupertinoButton.filled(
              onPressed: () {
                // 跳转到添加订阅源
              },
              child: const Text('添加订阅源'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator.adaptive(
      onRefresh: () => _refreshArticles(ref),
      child: ListView.builder(
        itemCount: articlesState.articles.length,
        itemBuilder: (ctx, i) => ArticleCard(article: articlesState.articles[i]),
      ),
    );
  }

  void _openSearch(BuildContext context) {
    Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => const SearchScreen(),
      ),
    );
  }

  void _openOfflineArticles(BuildContext context) {
    Navigator.of(context).push(
      CupertinoPageRoute(
        builder: (context) => const OfflineArticlesScreen(),
      ),
    );
  }

  Future<void> _refreshArticles(WidgetRef ref) async {
    final notifier = ref.read(articlesNotifierProvider.notifier);
    final selectedFeedId = ref.read(selectedFeedIdProvider);
    await notifier.loadArticles(feedId: selectedFeedId, uncategorized: ref.read(uncategorizedSelectedProvider));
  }
}
