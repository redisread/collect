import 'package:collect/providers/article_provider.dart';
import 'package:collect/providers/auth_provider.dart';
import 'package:collect/providers/feed_provider.dart';
import 'package:collect/services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeApi extends ApiService {
  final filters = <bool>[];
  @override
  Future<List<dynamic>> getArticles({String? feedId, bool uncategorized = false, bool? starred, bool? readLater, int page = 1}) async {
    filters.add(uncategorized);
    return [{'id': 'a', 'feedId': 'f', 'title': 'A', 'url': 'https://a.test'}];
  }
  @override
  Future<void> batchUpdateArticles(String action, List<String> ids) async {}
  @override
  Future<Map<String, dynamic>> extractArticle(String id) async => {};
  @override
  Future<void> updateArticle(String id, Map<String, dynamic> updates) async {}
  @override
  Future<Map<String, dynamic>> getArticle(String id) async => {
    'data': {'id': id, 'feedId': 'f', 'title': 'A', 'url': 'https://a.test', 'isRead': true}
  };
}

void main() {
  test('article actions preserve the selected group and refresh unread counts', () async {
    final api = FakeApi();
    var feedLoads = 0;
    final container = ProviderContainer(overrides: [
      apiServiceProvider.overrideWithValue(api),
      feedsProvider.overrideWith((ref) async { feedLoads++; return []; }),
    ]);
    addTearDown(container.dispose);
    container.read(uncategorizedSelectedProvider.notifier).state = true;
    final subscription = container.listen(feedsProvider, (previous, next) {}, fireImmediately: true);
    addTearDown(subscription.close);
    await container.read(feedsProvider.future);
    final notifier = container.read(articlesNotifierProvider.notifier);
    await notifier.loadArticles(uncategorized: true);
    await notifier.batchUpdate(['a'], 'markAsRead');
    await notifier.extractArticle('a');
    await notifier.fetchArticle('a');
    expect(container.read(articlesNotifierProvider).articles.single.isRead, isTrue);
    await notifier.toggleRead('a');
    await container.read(feedsProvider.future);
    expect(api.filters.every((value) => value), isTrue);
    expect(feedLoads, greaterThan(1));
  });
}
