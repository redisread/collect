import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// API 服务：封装所有与 collect-api 的 HTTP 通信
class ApiService {
  static const String _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8787',
  );

  final Dio _dio;
  final FlutterSecureStorage _storage;

  ApiService()
      : _dio = Dio(BaseOptions(
          baseUrl: _baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        )),
        _storage = const FlutterSecureStorage() {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        // 添加认证 cookie
        final cookie = await _storage.read(key: 'auth_cookie');
        if (cookie != null) {
          options.headers['Cookie'] = cookie;
        }
        handler.next(options);
      },
      onResponse: (response, handler) async {
        // 保存 Set-Cookie
        final setCookie = response.headers['set-cookie'];
        if (setCookie != null && setCookie.isNotEmpty) {
          await _storage.write(key: 'auth_cookie', value: setCookie.first);
        }
        handler.next(response);
      },
    ));
  }

  // ─── 认证 ─────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> signIn(String email, String password) async {
    final response = await _dio.post('/api/auth/sign-in/email', data: {
      'email': email,
      'password': password,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> signUp(
      String name, String email, String password) async {
    final response = await _dio.post('/api/auth/sign-up/email', data: {
      'name': name,
      'email': email,
      'password': password,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> signOut() async {
    await _dio.post('/api/auth/sign-out');
    await _storage.delete(key: 'auth_cookie');
  }

  Future<Map<String, dynamic>?> getSession() async {
    try {
      final response = await _dio.get('/api/auth/get-session');
      return response.data as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  // ─── 文件夹 ───────────────────────────────────────────────────────────────

  Future<List<dynamic>> getFolders() async {
    final response = await _dio.get('/api/folders');
    final data = response.data as Map<String, dynamic>;
    return data['data'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> createFolder(
      String name, String? color) async {
    final response = await _dio.post('/api/folders', data: {
      'name': name,
      if (color != null) 'color': color,
    });
    return response.data as Map<String, dynamic>;
  }

  // ─── 订阅源 ───────────────────────────────────────────────────────────────

  Future<List<dynamic>> getFeeds() async {
    final response = await _dio.get('/api/feeds');
    final data = response.data as Map<String, dynamic>;
    return data['data'] as List<dynamic>;
  }

  Future<Map<String, dynamic>> addFeed(String url, String? folderId) async {
    final response = await _dio.post('/api/feeds', data: {
      'url': url,
      if (folderId != null) 'folderId': folderId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> deleteFeed(String id) async {
    await _dio.delete('/api/feeds/$id');
  }

  // ─── 文章 ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getArticles({
    String? feedId,
    bool? starred,
    bool? readLater,
    int page = 1,
  }) async {
    final response = await _dio.get('/api/articles', queryParameters: {
      if (feedId != null) 'feedId': feedId,
      if (starred != null) 'starred': starred,
      if (readLater != null) 'readLater': readLater,
      'page': page,
    });
    final data = response.data as Map<String, dynamic>;
    return data['data'] as List<dynamic>;
  }

  /// 获取单个文章详情
  Future<Map<String, dynamic>> getArticle(String id) async {
    final response = await _dio.get('/api/articles/$id');
    return response.data as Map<String, dynamic>;
  }

  Future<void> updateArticle(String id, Map<String, dynamic> updates) async {
    await _dio.put('/api/articles/$id', data: updates);
  }

  /// 搜索文章
  Future<List<dynamic>> searchArticles(String query, {String? filter}) async {
    final response = await _dio.get('/api/articles/search', queryParameters: {
      'q': query,
      if (filter != null) 'filter': filter,
    });
    final data = response.data as Map<String, dynamic>;
    return data['data'] as List<dynamic>;
  }

  /// 更新阅读进度
  Future<void> updateReadingProgress(String articleId, {required int progress}) async {
    await _dio.put('/api/articles/$articleId/progress', data: {
      'progress': progress,
    });
  }

  /// 提取文章正文
  Future<Map<String, dynamic>> extractArticle(String id) async {
    final response = await _dio.post('/api/articles/$id/extract');
    return response.data as Map<String, dynamic>;
  }

  /// 翻译文章内容
  Future<Map<String, dynamic>> translateArticle({
    required String articleId,
    required String content,
    String targetLang = 'zh-CN',
  }) async {
    final response = await _dio.post('/api/translate', data: {
      'articleId': articleId,
      'content': content,
      'targetLang': targetLang,
    });
    final data = response.data as Map<String, dynamic>;
    if (data['success'] == true) {
      return data['data'] as Map<String, dynamic>;
    }
    throw Exception(data['error'] ?? '翻译失败');
  }

  /// 批量更新文章
  Future<void> batchUpdateArticles(String action, List<String> ids) async {
    await _dio.post('/api/articles/batch', data: {
      'action': action,
      'ids': ids,
    });
  }

  // ─── 翻译历史 ─────────────────────────────────────────────────────────────

  /// 获取翻译历史记录（分页）
  Future<Map<String, dynamic>> getTranslationHistory({
    int page = 1,
    int pageSize = 20,
  }) async {
    final response = await _dio.get('/api/translations/history', queryParameters: {
      'page': page,
      'pageSize': pageSize,
    });
    final data = response.data as Map<String, dynamic>;
    if (data['success'] == true) {
      return data['data'] as Map<String, dynamic>;
    }
    throw Exception(data['error'] ?? '获取翻译历史失败');
  }

  /// 删除翻译历史记录
  Future<void> deleteTranslationHistory(String id) async {
    await _dio.delete('/api/translations/history/$id');
  }

  // ─── 刷新 ─────────────────────────────────────────────────────────────────

  Future<void> refreshFeeds() async {
    await _dio.post('/api/refresh');
  }
}
