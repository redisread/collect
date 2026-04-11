import 'dart:async';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import '../models/article.dart';

/// 离线缓存服务
/// 管理文章的本地缓存，支持离线阅读
class OfflineService {
  static Database? _database;

  static Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  static Future<Database> _initDatabase() async {
    final directory = await getApplicationDocumentsDirectory();
    final path = join(directory.path, 'collect_offline.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE cached_articles(
            id TEXT PRIMARY KEY,
            feedId TEXT,
            title TEXT,
            content TEXT,
            url TEXT,
            summary TEXT,
            author TEXT,
            imageUrl TEXT,
            publishedAt TEXT,
            isRead INTEGER DEFAULT 0,
            isStarred INTEGER DEFAULT 0,
            isReadLater INTEGER DEFAULT 0,
            readingProgress INTEGER DEFAULT 0,
            cachedAt TEXT
          )
        ''');
      },
    );
  }

  /// 缓存文章
  static Future<void> cacheArticle(Article article, String? content) async {
    final db = await database;
    await db.insert(
      'cached_articles',
      {
        'id': article.id,
        'feedId': article.feedId,
        'title': article.title,
        'content': content ?? article.content ?? '',
        'url': article.url,
        'summary': article.summary,
        'author': article.author,
        'imageUrl': article.imageUrl,
        'publishedAt': article.publishedAt,
        'isRead': article.isRead ? 1 : 0,
        'isStarred': article.isStarred ? 1 : 0,
        'isReadLater': article.isReadLater ? 1 : 0,
        'readingProgress': article.readingProgress ?? 0,
        'cachedAt': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// 获取缓存的文章
  static Future<Article?> getCachedArticle(String articleId) async {
    final db = await database;
    final maps = await db.query(
      'cached_articles',
      where: 'id = ?',
      whereArgs: [articleId],
    );

    if (maps.isEmpty) return null;
    return _mapToArticle(maps.first);
  }

  /// 获取所有缓存的文章
  static Future<List<Article>> getAllCachedArticles() async {
    final db = await database;
    final maps = await db.query('cached_articles', orderBy: 'cachedAt DESC');
    return maps.map(_mapToArticle).toList();
  }

  /// 获取缓存文章数量
  static Future<int> getCachedCount() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as count FROM cached_articles');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// 删除缓存
  static Future<void> removeCachedArticle(String articleId) async {
    final db = await database;
    await db.delete(
      'cached_articles',
      where: 'id = ?',
      whereArgs: [articleId],
    );
  }

  /// 更新阅读进度
  static Future<void> updateReadingProgress(
    String articleId, {
    required int progress,
  }) async {
    final db = await database;
    await db.update(
      'cached_articles',
      {'readingProgress': progress},
      where: 'id = ?',
      whereArgs: [articleId],
    );
  }

  /// 清理所有缓存
  static Future<void> clearAllCache() async {
    final db = await database;
    await db.delete('cached_articles');
  }

  /// 清理过期的缓存（30天前的）
  static Future<void> cleanupOldCache() async {
    final db = await database;
    final cutoff = DateTime.now().subtract(const Duration(days: 30));
    await db.delete(
      'cached_articles',
      where: 'cachedAt < ?',
      whereArgs: [cutoff.toIso8601String()],
    );
  }

  /// 检查文章是否已缓存
  static Future<bool> isArticleCached(String articleId) async {
    final db = await database;
    final maps = await db.query(
      'cached_articles',
      where: 'id = ?',
      whereArgs: [articleId],
      limit: 1,
    );
    return maps.isNotEmpty;
  }

  /// 将数据库记录转换为 Article 对象
  static Article _mapToArticle(Map<String, dynamic> map) {
    return Article(
      id: map['id'] as String,
      feedId: map['feedId'] as String? ?? '',
      title: map['title'] as String? ?? '',
      url: map['url'] as String? ?? '',
      content: map['content'] as String?,
      summary: map['summary'] as String?,
      author: map['author'] as String?,
      imageUrl: map['imageUrl'] as String?,
      publishedAt: map['publishedAt'] as String?,
      isRead: (map['isRead'] as int? ?? 0) == 1,
      isStarred: (map['isStarred'] as int? ?? 0) == 1,
      isReadLater: (map['isReadLater'] as int? ?? 0) == 1,
      readingProgress: map['readingProgress'] as int?,
    );
  }
}
