import 'package:flutter_test/flutter_test.dart';
import 'package:collect/models/article.dart';

void main() {
  group('Article Model', () {
    test('should create Article from JSON', () {
      final json = {
        'id': 'article-1',
        'feedId': 'feed-1',
        'title': 'Test Article',
        'url': 'https://example.com/article',
        'content': '<p>Article content</p>',
        'summary': 'Article summary',
        'author': 'John Doe',
        'imageUrl': 'https://example.com/image.jpg',
        'publishedAt': '2024-03-21T10:00:00Z',
        'isRead': true,
        'isStarred': true,
        'isReadLater': false,
      };

      final article = Article.fromJson(json);

      expect(article.id, 'article-1');
      expect(article.feedId, 'feed-1');
      expect(article.title, 'Test Article');
      expect(article.url, 'https://example.com/article');
      expect(article.content, '<p>Article content</p>');
      expect(article.summary, 'Article summary');
      expect(article.author, 'John Doe');
      expect(article.imageUrl, 'https://example.com/image.jpg');
      expect(article.publishedAt, '2024-03-21T10:00:00Z');
      expect(article.isRead, true);
      expect(article.isStarred, true);
      expect(article.isReadLater, false);
    });

    test('should handle optional fields with defaults', () {
      final json = {
        'id': 'article-1',
        'feedId': 'feed-1',
        'title': 'Test Article',
        'url': 'https://example.com/article',
      };

      final article = Article.fromJson(json);

      expect(article.content, null);
      expect(article.summary, null);
      expect(article.author, null);
      expect(article.imageUrl, null);
      expect(article.publishedAt, null);
      expect(article.isRead, false);
      expect(article.isStarred, false);
      expect(article.isReadLater, false);
    });

    test('copyWith should create a copy with updated values', () {
      const article = Article(
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Test Article',
        url: 'https://example.com/article',
        isRead: false,
        isStarred: false,
      );

      final updatedArticle = article.copyWith(isRead: true, isStarred: true);

      expect(updatedArticle.id, article.id);
      expect(updatedArticle.title, article.title);
      expect(updatedArticle.isRead, true);
      expect(updatedArticle.isStarred, true);
    });

    test('copyWith should keep original values when not provided', () {
      const article = Article(
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Test Article',
        url: 'https://example.com/article',
        isRead: false,
        isStarred: true,
      );

      final updatedArticle = article.copyWith(isRead: true);

      expect(updatedArticle.isRead, true);
      expect(updatedArticle.isStarred, true);
    });

    test('should create Article with const constructor', () {
      const article = Article(
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Test Article',
        url: 'https://example.com/article',
      );

      expect(article.id, 'article-1');
      expect(article.isRead, false);
      expect(article.isStarred, false);
      expect(article.isReadLater, false);
    });
  });
}
