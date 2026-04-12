import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// 翻译历史记录
class TranslationHistoryEntry {
  final int? id;
  final String articleId;
  final String targetLang;
  final String sourceLang;
  final String? articleTitle;
  final String? feedName;
  final DateTime translatedAt;
  final bool synced;

  const TranslationHistoryEntry({
    this.id,
    required this.articleId,
    required this.targetLang,
    required this.sourceLang,
    this.articleTitle,
    this.feedName,
    required this.translatedAt,
    this.synced = false,
  });

  factory TranslationHistoryEntry.fromMap(Map<String, dynamic> map) =>
      TranslationHistoryEntry(
        id: map['id'] as int?,
        articleId: map['article_id'] as String,
        targetLang: map['target_lang'] as String,
        sourceLang: map['source_lang'] as String,
        articleTitle: map['article_title'] as String?,
        feedName: map['feed_name'] as String?,
        translatedAt: DateTime.parse(map['translated_at'] as String),
        synced: map['synced'] == 1,
      );

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'article_id': articleId,
        'target_lang': targetLang,
        'source_lang': sourceLang,
        'article_title': articleTitle,
        'feed_name': feedName,
        'translated_at': translatedAt.toIso8601String(),
        'synced': synced ? 1 : 0,
      };
}

/// 翻译历史本地存储服务
class TranslationHistoryService {
  static final TranslationHistoryService _instance =
      TranslationHistoryService._internal();

  factory TranslationHistoryService() => _instance;

  TranslationHistoryService._internal();

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  Future<Database> _initDb() async {
    final dir = await getApplicationDocumentsDirectory();
    final path = '${dir.path}/collect_translation_history.db';

    return openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE translation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            target_lang TEXT NOT NULL,
            source_lang TEXT NOT NULL,
            article_title TEXT,
            feed_name TEXT,
            translated_at TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0
          )
        ''');
        await db.execute(
            'CREATE INDEX idx_article_id ON translation_history(article_id)');
        await db.execute(
            'CREATE INDEX idx_synced ON translation_history(synced)');
      },
    );
  }

  /// 添加翻译记录
  Future<void> addEntry(TranslationHistoryEntry entry) async {
    final db = await database;
    // 如果该文章已有相同语言的记录，替换
    await db.delete(
      'translation_history',
      where: 'article_id = ? AND target_lang = ?',
      whereArgs: [entry.articleId, entry.targetLang],
    );
    await db.insert('translation_history', entry.toMap());
  }

  /// 获取所有记录（分页）
  Future<List<TranslationHistoryEntry>> getEntries({
    int page = 1,
    int pageSize = 20,
  }) async {
    final db = await database;
    final offset = (page - 1) * pageSize;
    final maps = await db.query(
      'translation_history',
      orderBy: 'translated_at DESC',
      limit: pageSize,
      offset: offset,
    );
    return maps.map((m) => TranslationHistoryEntry.fromMap(m)).toList();
  }

  /// 获取总数
  Future<int> getCount() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as count FROM translation_history');
    return result.first['count'] as int;
  }

  /// 获取未同步的记录
  Future<List<TranslationHistoryEntry>> getUnsyncedEntries() async {
    final db = await database;
    final maps = await db.query(
      'translation_history',
      where: 'synced = ?',
      whereArgs: [0],
    );
    return maps.map((m) => TranslationHistoryEntry.fromMap(m)).toList();
  }

  /// 标记为已同步
  Future<void> markSynced(int id) async {
    final db = await database;
    await db.update(
      'translation_history',
      {'synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 删除记录
  Future<void> deleteEntry(int id) async {
    final db = await database;
    await db.delete(
      'translation_history',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// 清空所有记录
  Future<void> clearAll() async {
    final db = await database;
    await db.delete('translation_history');
  }
}
