import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/translation_provider.dart';
import '../providers/auth_provider.dart';

/// 翻译历史页面
class TranslationHistoryScreen extends ConsumerStatefulWidget {
  const TranslationHistoryScreen({super.key});

  @override
  ConsumerState<TranslationHistoryScreen> createState() =>
      _TranslationHistoryScreenState();
}

class _TranslationHistoryScreenState
    extends ConsumerState<TranslationHistoryScreen> {
  final ScrollController _scrollController = ScrollController();
  bool _isLoading = false;
  bool _hasMore = true;
  List<Map<String, dynamic>> _items = [];
  int _page = 1;
  int _total = 0;
  static const _pageSize = 20;

  @override
  void initState() {
    super.initState();
    _loadHistory();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200 &&
        !_isLoading &&
        _hasMore) {
      _loadHistory();
    }
  }

  Future<void> _loadHistory() async {
    if (_isLoading) return;

    setState(() => _isLoading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.getTranslationHistory(
        page: _page,
        pageSize: _pageSize,
      );
      final newItems = List<Map<String, dynamic>>.from(data['items'] as List);
      _total = data['total'] as int;

      setState(() {
        _items = [..._items, ...newItems];
        _page++;
        _hasMore = _items.length < _total;
      });
    } catch (e) {
      debugPrint('加载翻译历史失败: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _deleteItem(String id, int index) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.deleteTranslationHistory(id);

      setState(() {
        _items.removeAt(index);
        _total--;
      });
    } catch (e) {
      _showToast('删除失败: $e');
    }
  }

  void _showToast(String message) {
    if (!mounted) return;
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (context) => Positioned(
        bottom: 100,
        left: MediaQuery.of(context).size.width * 0.2,
        width: MediaQuery.of(context).size.width * 0.6,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey2.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: CupertinoColors.white, fontSize: 14),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(seconds: 2), entry.remove);
  }

  String _getLanguageLabel(String code) {
    final lang = supportedLanguages.cast<(String, String)?>().firstWhere(
          (l) => l?.$1 == code,
          orElse: () => null,
        );
    return lang?.$2 ?? code;
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: const Text('翻译历史'),
        leading: CupertinoNavigationBarBackButton(
          onPressed: () => context.pop(),
        ),
      ),
      child: SafeArea(
        child: _items.isEmpty && !_isLoading
            ? const Center(
                child: Text(
                  '暂无翻译历史',
                  style: TextStyle(
                    fontSize: 15,
                    color: CupertinoColors.systemGrey,
                  ),
                ),
              )
            : ListView.builder(
                controller: _scrollController,
                itemCount: _items.length + (_hasMore ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= _items.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CupertinoActivityIndicator()),
                    );
                  }

                  final item = _items[index];
                  return Dismissible(
                    key: Key(item['id'] as String),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      color: CupertinoColors.systemRed,
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 20),
                      child: const Icon(
                        CupertinoIcons.delete,
                        color: CupertinoColors.white,
                      ),
                    ),
                    confirmDismiss: (direction) async {
                      return await showCupertinoDialog<bool>(
                            context: context,
                            builder: (context) => CupertinoAlertDialog(
                              title: const Text('确认删除'),
                              content: const Text('确定要删除这条翻译记录吗？'),
                              actions: [
                                CupertinoDialogAction(
                                  child: const Text('取消'),
                                  onPressed: () => context.pop(false),
                                ),
                                CupertinoDialogAction(
                                  isDestructiveAction: true,
                                  child: const Text('删除'),
                                  onPressed: () => context.pop(true),
                                ),
                              ],
                            ),
                          ) ??
                          false;
                    },
                    onDismissed: (_) =>
                        _deleteItem(item['id'] as String, index),
                    child: _buildHistoryItem(item),
                  );
                },
              ),
      ),
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> item) {
    final articleTitle = item['articleTitle'] as String? ?? '未知文章';
    final feedName = item['feedName'] as String?;
    final targetLang = _getLanguageLabel(item['targetLang'] as String);
    final sourceLang = _getLanguageLabel(item['sourceLang'] as String);
    final translatedAt = DateTime.parse(item['translatedAt'] as String);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: CupertinoColors.separator.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            articleTitle,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: CupertinoColors.label,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          if (feedName != null)
            Text(
              feedName,
              style: const TextStyle(
                fontSize: 13,
                color: CupertinoColors.systemGrey,
              ),
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(
                Icons.translate,
                size: 12,
                color: CupertinoColors.systemGrey,
              ),
              const SizedBox(width: 4),
              Text(
                '$sourceLang → $targetLang',
                style: const TextStyle(
                  fontSize: 12,
                  color: CupertinoColors.systemGrey,
                ),
              ),
              const Spacer(),
              Text(
                _formatDate(translatedAt),
                style: const TextStyle(
                  fontSize: 12,
                  color: CupertinoColors.systemGrey2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inMinutes < 1) return '刚刚';
    if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
    if (diff.inDays < 1) return '${diff.inHours} 小时前';
    if (diff.inDays < 7) return '${diff.inDays} 天前';

    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }
}
