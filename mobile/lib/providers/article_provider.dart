import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/article.dart';
import '../services/offline_service.dart';
import 'auth_provider.dart';
import 'feed_provider.dart';

/// 文章列表状态
class ArticlesState {
  final List<Article> articles;
  final bool isLoading;
  final String? error;

  const ArticlesState({
    this.articles = const [],
    this.isLoading = false,
    this.error,
  });

  ArticlesState copyWith({
    List<Article>? articles,
    bool? isLoading,
    String? error,
  }) {
    return ArticlesState(
      articles: articles ?? this.articles,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

/// 文章列表状态管理器
class ArticlesNotifier extends StateNotifier<ArticlesState> {
  final Ref ref;
  int _readVersion = 0;
  int _loadVersion = 0;
  final Map<String, ({bool isRead, int version})> _readChanges = {};
  final Set<String> _pendingReadIds = {};

  ArticlesNotifier(this.ref) : super(const ArticlesState(isLoading: true));

  Future<Article> fetchArticle(String articleId) async {
    final readVersion = _readVersion;
    final data = await ref.read(apiServiceProvider).getArticle(articleId);
    var article = Article.fromJson(data['data'] as Map<String, dynamic>);
    final change = _readChanges[articleId];
    if (change != null && (change.version > readVersion || _pendingReadIds.contains(articleId))) {
      article = article.copyWith(isRead: change.isRead);
    } else {
      _updateArticle(articleId, isRead: article.isRead);
    }
    ref.invalidate(feedsProvider);
    return article;
  }

  /// 加载文章列表
  Future<void> loadArticles({String? feedId, bool uncategorized = false}) async {
    final readVersion = _readVersion;
    final loadVersion = ++_loadVersion;
    state = state.copyWith(isLoading: true, error: null);
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.getArticles(feedId: feedId, uncategorized: uncategorized);
      final articles =
          data.map((e) => Article.fromJson(e as Map<String, dynamic>)).toList();
      if (!mounted || loadVersion != _loadVersion) return;
      state = state.copyWith(articles: articles.map((article) {
        final change = _readChanges[article.id];
        return change != null && (change.version > readVersion || _pendingReadIds.contains(article.id))
            ? article.copyWith(isRead: change.isRead) : article;
      }).toList(), isLoading: false);
    } catch (e) {
      if (!mounted || loadVersion != _loadVersion) return;
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  /// 切换已读状态（乐观更新）
  Future<bool> toggleRead(String articleId) async {
    if (!_pendingReadIds.add(articleId)) return false;
    try {
    final article = state.articles.firstWhere((a) => a.id == articleId);
    final newReadStatus = !article.isRead;

    // 乐观更新 UI
    _updateArticle(articleId, isRead: newReadStatus);

    try {
      final api = ref.read(apiServiceProvider);
      await api.updateArticle(articleId, {'isRead': newReadStatus});
      _updateArticle(articleId, isRead: newReadStatus);
      ref.invalidate(feedsProvider);
      return true;
    } catch (e) {
      // 失败时回滚
      _updateArticle(articleId, isRead: article.isRead);
      rethrow;
    }
    } finally { _pendingReadIds.remove(articleId); }
  }

  /// 切换收藏状态（乐观更新）
  /// 收藏时自动缓存文章，取消收藏时删除缓存
  Future<void> toggleStar(String articleId) async {
    final article = state.articles.firstWhere((a) => a.id == articleId);
    final newStarredStatus = !article.isStarred;

    // 乐观更新 UI
    _updateArticle(articleId, isStarred: newStarredStatus);

    try {
      final api = ref.read(apiServiceProvider);
      await api.updateArticle(articleId, {'isStarred': newStarredStatus});

      // 如果标记为收藏，自动缓存文章
      if (newStarredStatus) {
        final fullArticle = await fetchArticle(articleId);
        await OfflineService.cacheArticle(fullArticle, fullArticle.content);
      } else {
        // 取消收藏时可选删除缓存
        await OfflineService.removeCachedArticle(articleId);
      }
    } catch (e) {
      // 失败时回滚
      _updateArticle(articleId, isStarred: article.isStarred);
      rethrow;
    }
  }

  /// 批量更新文章状态
  Future<void> batchUpdate(List<String> articleIds, String action) async {
    final api = ref.read(apiServiceProvider);
    await api.batchUpdateArticles(action, articleIds);
    ref.invalidate(feedsProvider);
    await _reloadSelected();
  }

  /// 提取文章内容
  Future<void> extractArticle(String articleId) async {
    final api = ref.read(apiServiceProvider);
    await api.extractArticle(articleId);
    // 重新加载文章以获取提取后的内容
    await _reloadSelected();
  }

  Future<void> _reloadSelected() => loadArticles(
        feedId: ref.read(selectedFeedIdProvider),
        uncategorized: ref.read(uncategorizedSelectedProvider),
      );

  /// 更新阅读进度
  Future<void> updateReadingProgress(
    String articleId, {
    required int progress,
  }) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.updateReadingProgress(articleId, progress: progress);

      // 乐观更新
      _updateArticle(articleId, readingProgress: progress, isRead: progress >= 95 ? true : null);
      if (progress >= 95) ref.invalidate(feedsProvider);

      // 同时更新本地缓存
      await OfflineService.updateReadingProgress(articleId, progress: progress);
    } catch (e) {
      // 离线时只更新本地缓存
      await OfflineService.updateReadingProgress(articleId, progress: progress);
      // 乐观更新 UI
      _updateArticle(articleId, readingProgress: progress);
    }
  }

  /// 更新本地文章状态
  void _updateArticle(
    String articleId, {
    bool? isRead,
    bool? isStarred,
    bool? isReadLater,
    int? readingProgress,
  }) {
    if (isRead != null) _readChanges[articleId] = (isRead: isRead, version: ++_readVersion);
    final updatedArticles = state.articles.map((article) {
      if (article.id == articleId) {
        return article.copyWith(
          isRead: isRead,
          isStarred: isStarred,
          isReadLater: isReadLater,
          readingProgress: readingProgress,
        );
      }
      return article;
    }).toList();
    state = state.copyWith(articles: updatedArticles);
  }

  /// 获取单个文章
  Article? getArticle(String articleId) {
    try {
      return state.articles.firstWhere((a) => a.id == articleId);
    } catch (_) {
      return null;
    }
  }
}

/// 文章列表 Provider
final articlesNotifierProvider =
    StateNotifierProvider<ArticlesNotifier, ArticlesState>((ref) {
  final notifier = ArticlesNotifier(ref);
  void reload() => notifier.loadArticles(
        feedId: ref.read(selectedFeedIdProvider),
        uncategorized: ref.read(uncategorizedSelectedProvider),
      );
  ref.listen(selectedFeedIdProvider, (previous, next) => reload());
  ref.listen(uncategorizedSelectedProvider, (previous, next) => reload());
  reload();

  return notifier;
});

/// 向后兼容：原有的 FutureProvider（现在基于 StateNotifier）
final articlesProvider = FutureProvider<List<Article>>((ref) async {
  final state = ref.watch(articlesNotifierProvider);
  if (state.error != null) {
    throw Exception(state.error);
  }
  return state.articles;
});

/// 当前选中文章的 Provider（用于详情页获取）
final currentArticleProvider = Provider.family<Article?, String>((ref, articleId) {
  final state = ref.watch(articlesNotifierProvider);
  try {
    return state.articles.firstWhere((a) => a.id == articleId);
  } catch (_) {
    return null;
  }
});

/// 搜索相关 Provider
final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<Article>>((ref) async {
  final query = ref.watch(searchQueryProvider);
  if (query.isEmpty) return [];

  final api = ref.read(apiServiceProvider);
  try {
    final data = await api.searchArticles(query);
    return data.map((e) => Article.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    throw Exception('搜索失败: $e');
  }
});

final selectedArticleIdProvider = StateProvider<String?>((ref) => null);
