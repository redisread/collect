import 'package:flutter_test/flutter_test.dart';
import 'package:collect/models/feed.dart';

void main() {
  group('Feed Model', () {
    test('should create Feed from JSON', () {
      final json = {
        'id': 'feed-1',
        'userId': 'user-1',
        'folderId': 'folder-1',
        'title': 'Tech News',
        'url': 'https://example.com',
        'feedUrl': 'https://example.com/rss',
        'description': 'A tech news feed',
        'faviconUrl': 'https://example.com/favicon.ico',
        'unreadCount': 5,
      };

      final feed = Feed.fromJson(json);

      expect(feed.id, 'feed-1');
      expect(feed.userId, 'user-1');
      expect(feed.folderId, 'folder-1');
      expect(feed.title, 'Tech News');
      expect(feed.url, 'https://example.com');
      expect(feed.feedUrl, 'https://example.com/rss');
      expect(feed.description, 'A tech news feed');
      expect(feed.faviconUrl, 'https://example.com/favicon.ico');
      expect(feed.unreadCount, 5);
    });

    test('should handle optional fields', () {
      final json = {
        'id': 'feed-1',
        'userId': 'user-1',
        'title': 'Tech News',
        'url': 'https://example.com',
        'feedUrl': 'https://example.com/rss',
      };

      final feed = Feed.fromJson(json);

      expect(feed.folderId, null);
      expect(feed.description, null);
      expect(feed.faviconUrl, null);
      expect(feed.unreadCount, 0);
    });

    test('should create Feed with const constructor', () {
      const feed = Feed(
        id: 'feed-1',
        userId: 'user-1',
        title: 'Tech News',
        url: 'https://example.com',
        feedUrl: 'https://example.com/rss',
      );

      expect(feed.id, 'feed-1');
      expect(feed.unreadCount, 0);
    });
  });
}
