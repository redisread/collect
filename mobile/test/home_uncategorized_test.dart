import 'package:collect/models/feed.dart';
import 'package:collect/providers/article_provider.dart';
import 'package:collect/providers/feed_provider.dart';
import 'package:collect/screens/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeArticles extends ArticlesNotifier {
  FakeArticles(super.ref);
  @override
  Future<void> loadArticles({String? feedId, bool uncategorized = false}) async {}
}

void main() {
  testWidgets('wide sidebar displays the unclassified group and unread count', (tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(ProviderScope(overrides: [
      feedsProvider.overrideWith((ref) async => [
        const Feed(id: '1', userId: 'u', title: 'Feed', url: 'https://a.test', feedUrl: 'https://a.test/rss', unreadCount: 3),
      ]),
      articlesNotifierProvider.overrideWith((ref) => FakeArticles(ref)),
    ], child: const MaterialApp(home: HomeScreen())));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('未分类'), findsOneWidget);
    expect(find.text('3 篇未读'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
