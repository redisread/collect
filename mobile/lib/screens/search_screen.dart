import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../utils/debouncer.dart';
import '../providers/article_provider.dart';
import '../models/article.dart';
import 'article_detail_screen.dart';

/// 搜索页面
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchController = TextEditingController();
  late final Debouncer _debounce;
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _debounce = Debouncer(milliseconds: 300);
    // 清空搜索状态
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(searchQueryProvider.notifier).state = '';
    });
  }

  @override
  void dispose() {
    _debounce.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _performSearch(String query) {
    ref.read(searchQueryProvider.notifier).state = query;
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: CupertinoSearchTextField(
          controller: _searchController,
          onChanged: (value) {
            _debounce.run(() => _performSearch(value));
          },
          placeholder: '搜索文章...',
          autofocus: true,
        ),
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      child: _buildSearchResults(),
    );
  }

  Widget _buildSearchResults() {
    final searchQuery = ref.watch(searchQueryProvider);
    final searchResults = ref.watch(searchResultsProvider);

    // 如果搜索词为空，显示提示
    if (searchQuery.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              CupertinoIcons.search,
              size: 64,
              color: CupertinoColors.systemGrey,
            ),
            SizedBox(height: 16),
            Text(
              '输入关键词搜索文章',
              style: TextStyle(
                fontSize: 17,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
      );
    }

    return searchResults.when(
      data: (articles) {
        if (articles.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  CupertinoIcons.doc_text_search,
                  size: 64,
                  color: CupertinoColors.systemGrey,
                ),
                SizedBox(height: 16),
                Text(
                  '没有找到相关文章',
                  style: TextStyle(
                    fontSize: 17,
                    color: CupertinoColors.systemGrey,
                  ),
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          controller: _scrollController,
          itemCount: articles.length,
          itemBuilder: (context, index) {
            final article = articles[index];
            return _SearchResultCard(
              article: article,
              query: searchQuery,
              onTap: () => _openArticle(article),
            );
          },
        );
      },
      loading: () => const Center(
        child: CupertinoActivityIndicator(),
      ),
      error: (error, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              CupertinoIcons.exclamationmark_triangle,
              size: 48,
              color: CupertinoColors.systemRed.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 16),
            Text(
              '搜索失败: $error',
              style: const TextStyle(
                fontSize: 17,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
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
}

/// 搜索结果卡片（带高亮功能）
class _SearchResultCard extends StatelessWidget {
  final Article article;
  final String query;
  final VoidCallback onTap;

  const _SearchResultCard({
    required this.article,
    required this.query,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return CupertinoButton(
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
            _buildHighlightedText(
              article.title,
              query,
              context,
              const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (article.summary?.isNotEmpty ?? false) ...[
              const SizedBox(height: 4),
              _buildHighlightedText(
                article.summary!,
                query,
                context,
                TextStyle(
                  fontSize: 14,
                  color: CupertinoColors.systemGrey.resolveFrom(context),
                ),
                maxLines: 2,
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                if (article.isStarred)
                  const Icon(
                    CupertinoIcons.star_fill,
                    size: 12,
                    color: CupertinoColors.systemYellow,
                  ),
                if (article.isStarred) const SizedBox(width: 4),
                if (!article.isRead)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: CupertinoColors.activeBlue,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                if (!article.isRead) const SizedBox(width: 8),
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
    );
  }

  /// 构建高亮文本
  Widget _buildHighlightedText(
    String text,
    String query,
    BuildContext context,
    TextStyle baseStyle, {
    int maxLines = 3,
  }) {
    if (query.isEmpty) {
      return Text(
        text,
        style: baseStyle,
        maxLines: maxLines,
        overflow: TextOverflow.ellipsis,
      );
    }

    final lowerText = text.toLowerCase();
    final lowerQuery = query.toLowerCase();
    final matches = <TextSpan>[];
    int start = 0;

    while (true) {
      final index = lowerText.indexOf(lowerQuery, start);
      if (index == -1) break;

      // 添加匹配前的文本
      if (index > start) {
        matches.add(TextSpan(
          text: text.substring(start, index),
          style: baseStyle,
        ));
      }

      // 添加高亮的匹配文本
      matches.add(TextSpan(
        text: text.substring(index, index + query.length),
        style: baseStyle.copyWith(
          backgroundColor: CupertinoColors.systemYellow.withValues(alpha: 0.4),
          fontWeight: FontWeight.w600,
        ),
      ));

      start = index + query.length;
    }

    // 添加剩余的文本
    if (start < text.length) {
      matches.add(TextSpan(
        text: text.substring(start),
        style: baseStyle,
      ));
    }

    return RichText(
      text: TextSpan(children: matches),
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
    );
  }
}
