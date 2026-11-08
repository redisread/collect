import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/translation_history.dart';
import 'connectivity_provider.dart';
import 'auth_provider.dart';

/// 翻译段
class TranslationSegment {
  final String original;
  final String translated;

  const TranslationSegment({required this.original, required this.translated});

  factory TranslationSegment.fromJson(Map<String, dynamic> json) =>
      TranslationSegment(
        original: json['original'] as String,
        translated: json['translated'] as String,
      );

  Map<String, dynamic> toJson() => {
        'original': original,
        'translated': translated,
      };
}

/// 翻译结果
class TranslationResult {
  final List<TranslationSegment> segments;
  final String targetLang;
  final String detectedLang;
  final DateTime timestamp;

  const TranslationResult({
    required this.segments,
    required this.targetLang,
    required this.detectedLang,
    required this.timestamp,
  });

  factory TranslationResult.fromJson(Map<String, dynamic> json) {
    final segmentsJson = json['segments'] as List<dynamic>;
    return TranslationResult(
      segments: segmentsJson
          .map((e) => TranslationSegment.fromJson(e as Map<String, dynamic>))
          .toList(),
      targetLang: json['targetLang'] as String? ?? 'zh-CN',
      detectedLang: json['detectedLang'] as String? ?? 'auto',
      timestamp: DateTime.fromMillisecondsSinceEpoch(json['timestamp'] as int),
    );
  }
}

/// 支持的语言（与 api/src/config/languages.ts 保持一致）
const supportedLanguages = [
  ('zh-CN', '简体中文'),
  ('zh-TW', '繁體中文'),
  ('en', 'English'),
  ('ja', '日本語'),
  ('ko', '한국어'),
  ('fr', 'Français'),
  ('de', 'Deutsch'),
  ('es', 'Español'),
  ('pt', 'Português'),
  ('ru', 'Русский'),
  ('ar', 'العربية'),
  ('hi', 'हिन्दी'),
  ('it', 'Italiano'),
  ('nl', 'Nederlands'),
  ('th', 'ไทย'),
];

// 翻译缓存过期时间（7 天）
const _cacheExpirationDays = 7;

/// 翻译状态
class TranslationState {
  final Map<String, TranslationResult> translations;
  final bool isTranslating;
  final String targetLanguage;
  final bool isOffline;

  const TranslationState({
    this.translations = const {},
    this.isTranslating = false,
    this.targetLanguage = 'zh-CN',
    this.isOffline = false,
  });

  TranslationState copyWith({
    Map<String, TranslationResult>? translations,
    bool? isTranslating,
    String? targetLanguage,
    bool? isOffline,
  }) {
    return TranslationState(
      translations: translations ?? this.translations,
      isTranslating: isTranslating ?? this.isTranslating,
      targetLanguage: targetLanguage ?? this.targetLanguage,
      isOffline: isOffline ?? this.isOffline,
    );
  }
}

/// 翻译状态管理器
class TranslationNotifier extends StateNotifier<TranslationState> {
  final Ref ref;
  SharedPreferences? _prefs;

  TranslationNotifier(this.ref) : super(const TranslationState()) {
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    _prefs = await SharedPreferences.getInstance();
    final lang = _prefs?.getString('translation_target_lang') ?? 'zh-CN';
    state = state.copyWith(targetLanguage: lang);

    // 加载所有缓存的翻译
    await _loadCachedTranslations();
  }

  /// 加载缓存的翻译（包括过期检查）
  Future<void> _loadCachedTranslations() async {
    if (_prefs == null) return;

    final keys = _prefs!.getKeys();
    final now = DateTime.now();
    final loaded = <String, TranslationResult>{};

    for (final key in keys) {
      if (!key.startsWith('translation:') || key.startsWith('rate:')) continue;

      final cached = _prefs!.getString(key);
      if (cached == null) continue;

      try {
        final result = TranslationResult.fromJson(
            Map<String, dynamic>.from(jsonDecode(cached)));

        // 检查缓存是否过期
        final age = now.difference(result.timestamp);
        if (age.inDays >= _cacheExpirationDays) {
          // 删除过期缓存
          await _prefs!.remove(key);
          continue;
        }

        // 提取 articleId: translation:{articleId}:{targetLang}
        final parts = key.split(':');
        if (parts.length >= 2) {
          loaded[parts[1]] = result;
        }
      } catch (_) {
        // 缓存损坏，忽略
        await _prefs!.remove(key);
      }
    }

    state = state.copyWith(translations: loaded);
  }

  /// 检查缓存是否有效
  bool _isCacheValid(TranslationResult result) {
    final age = DateTime.now().difference(result.timestamp);
    return age.inDays < _cacheExpirationDays;
  }

  /// 设置目标语言
  Future<void> setTargetLanguage(String lang) async {
    state = state.copyWith(targetLanguage: lang);
    await _prefs?.setString('translation_target_lang', lang);
  }

  /// 翻译文章
  Future<TranslationResult?> translateArticle({
    required String articleId,
    required String content,
  }) async {
    // 检查本地缓存
    final cacheKey = 'translation:$articleId:${state.targetLanguage}';
    final cached = _prefs?.getString(cacheKey);
    if (cached != null) {
      try {
        final result = TranslationResult.fromJson(
            Map<String, dynamic>.from(jsonDecode(cached)));
        if (_isCacheValid(result)) {
          state = state.copyWith(
            translations: {...state.translations, articleId: result},
            isOffline: true, // 使用缓存时标记为离线模式
          );
          return result;
        } else {
          // 删除过期缓存
          await _prefs?.remove(cacheKey);
        }
      } catch (_) {
        // 缓存损坏，忽略
      }
    }

    state = state.copyWith(isTranslating: true);
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.translateArticle(
        articleId: articleId,
        content: content,
        targetLang: state.targetLanguage,
      );

      final result = TranslationResult.fromJson(data);
      state = state.copyWith(
        translations: {...state.translations, articleId: result},
        isTranslating: false,
        isOffline: false,
      );

      // 缓存到本地
      await _prefs?.setString(cacheKey, jsonEncode(data));

      // 写入本地历史记录
      await _saveHistoryEntry(articleId);

      return result;
    } catch (e) {
      state = state.copyWith(isTranslating: false);
      // 如果网络请求失败但有缓存，仍返回缓存（即使已过期）
      if (cached != null) {
        try {
          final result = TranslationResult.fromJson(
              Map<String, dynamic>.from(jsonDecode(cached)));
          state = state.copyWith(
            translations: {...state.translations, articleId: result},
            isOffline: true,
          );
          return result;
        } catch (_) {}
      }
      rethrow;
    }
  }

  /// 保存翻译历史记录
  Future<void> _saveHistoryEntry(String articleId) async {
    try {
      final history = TranslationHistoryService();
      await history.addEntry(TranslationHistoryEntry(
        articleId: articleId,
        targetLang: state.targetLanguage,
        sourceLang: 'auto',
        translatedAt: DateTime.now(),
      ));
    } catch (_) {
      // 不阻塞主流程
    }
  }

  /// 同步未上传的翻译历史（网络恢复时调用）
  Future<void> syncHistory() async {
    try {
      final history = TranslationHistoryService();
      final unsynced = await history.getUnsyncedEntries();
      for (final entry in unsynced) {
        await history.markSynced(entry.id!);
      }
    } catch (_) {
      // 同步失败时忽略
    }
  }

  /// 获取本地翻译历史
  Future<List<TranslationHistoryEntry>> getLocalHistory({
    int page = 1,
    int pageSize = 20,
  }) async {
    final history = TranslationHistoryService();
    return history.getEntries(page: page, pageSize: pageSize);
  }

  /// 获取本地翻译历史总数
  Future<int> getLocalHistoryCount() async {
    final history = TranslationHistoryService();
    return history.getCount();
  }

  /// 删除本地翻译历史
  Future<void> deleteLocalHistory(int id) async {
    final history = TranslationHistoryService();
    await history.deleteEntry(id);
  }

  /// 清除翻译
  Future<void> clearTranslation(String articleId) async {
    final newTranslations = Map<String, TranslationResult>.from(state.translations);
    newTranslations.remove(articleId);

    // 同时清除本地缓存
    final cacheKey = 'translation:$articleId:${state.targetLanguage}';
    await _prefs?.remove(cacheKey);

    state = state.copyWith(translations: newTranslations);
  }

  /// 获取翻译结果
  TranslationResult? getTranslation(String articleId) =>
      state.translations[articleId];
}

/// Provider
final translationProvider =
    StateNotifierProvider<TranslationNotifier, TranslationState>((ref) {
  return TranslationNotifier(ref);
});

/// 自动同步提供者（在网络恢复时触发同步）
final translationSyncProvider = Provider<void>((ref) {
  final status = ref.watch(connectivityProvider);
  if (status == NetworkStatus.online) {
    final notifier = ref.watch(translationProvider.notifier);
    Future.microtask(() => notifier.syncHistory());
  }
});
