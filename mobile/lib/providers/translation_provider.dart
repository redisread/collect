import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

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

/// 支持的语言
const supportedLanguages = [
  ('zh-CN', '简体中文'),
  ('zh-TW', '繁體中文'),
  ('en', 'English'),
  ('ja', '日本語'),
  ('ko', '한국어'),
];

/// 翻译状态
class TranslationState {
  final Map<String, TranslationResult> translations;
  final bool isTranslating;
  final String targetLanguage;

  const TranslationState({
    this.translations = const {},
    this.isTranslating = false,
    this.targetLanguage = 'zh-CN',
  });

  TranslationState copyWith({
    Map<String, TranslationResult>? translations,
    bool? isTranslating,
    String? targetLanguage,
  }) {
    return TranslationState(
      translations: translations ?? this.translations,
      isTranslating: isTranslating ?? this.isTranslating,
      targetLanguage: targetLanguage ?? this.targetLanguage,
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
        state = state.copyWith(
          translations: {...state.translations, articleId: result},
        );
        return result;
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
      );

      // 缓存到本地
      await _prefs?.setString(cacheKey, data.toString());
      return result;
    } catch (e) {
      state = state.copyWith(isTranslating: false);
      rethrow;
    }
  }

  /// 清除翻译
  void clearTranslation(String articleId) {
    final newTranslations = Map<String, TranslationResult>.from(state.translations);
    newTranslations.remove(articleId);
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
