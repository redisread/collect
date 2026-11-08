import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/article.dart';
import '../providers/article_provider.dart';

/// 支持滑动操作的文章卡片组件
/// - 左滑：已读/未读
/// - 右滑：收藏/取消收藏
class ArticleCard extends ConsumerWidget {
  final Article article;

  const ArticleCard({super.key, required this.article});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Dismissible(
      key: Key('article_${article.id}'),
      direction: DismissDirection.horizontal,
      confirmDismiss: (direction) async {
        // 不实际移除项目，只触发操作
        return false;
      },
      onUpdate: (details) {
        // 滑动过程中可以添加反馈
      },
      background: _buildSwipeBackground(
        // 从右向左滑（显示在右侧）：收藏
        alignment: Alignment.centerRight,
        color: CupertinoColors.systemYellow,
        icon: article.isStarred
            ? CupertinoIcons.star_fill
            : CupertinoIcons.star,
        label: article.isStarred ? '取消收藏' : '收藏',
        direction: DismissDirection.endToStart,
      ),
      secondaryBackground: _buildSwipeBackground(
        // 从左向右滑（显示在左侧）：已读/未读
        alignment: Alignment.centerLeft,
        color: CupertinoColors.systemBlue,
        icon: article.isRead
            ? CupertinoIcons.envelope
            : CupertinoIcons.envelope_open,
        label: article.isRead ? '标记未读' : '标记已读',
        direction: DismissDirection.startToEnd,
      ),
      child: _buildCardContent(context, ref),
    );
  }

  /// 构建滑动背景
  Widget _buildSwipeBackground({
    required Alignment alignment,
    required Color color,
    required IconData icon,
    required String label,
    required DismissDirection direction,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(0),
      ),
      alignment: alignment,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (alignment == Alignment.centerLeft) ...[
            Icon(icon, color: CupertinoColors.white, size: 24),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ] else ...[
            Text(
              label,
              style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 8),
            Icon(icon, color: CupertinoColors.white, size: 24),
          ],
        ],
      ),
    );
  }

  /// 构建卡片内容
  Widget _buildCardContent(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => context.push('/article/${article.id}'),
      onHorizontalDragEnd: (details) {
        // 检测滑动方向并执行相应操作
        if (details.primaryVelocity == null) return;

        final velocity = details.primaryVelocity!;
        const threshold = 100.0; // 滑动速度阈值

        if (velocity < -threshold) {
          // 向左滑动：切换收藏状态
          _toggleStar(ref);
        } else if (velocity > threshold) {
          // 向右滑动：切换已读状态
          _toggleRead(ref);
        }
      },
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          border: Border(
            bottom: BorderSide(
              color: Theme.of(context).dividerColor.withValues(alpha: 0.5),
              width: 0.5,
            ),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 已读/未读指示器
              if (!article.isRead)
                Container(
                  margin: const EdgeInsets.only(right: 8, top: 6),
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: CupertinoColors.systemBlue,
                    shape: BoxShape.circle,
                  ),
                )
              else
                const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            article.title,
                            style: TextStyle(
                              fontWeight: article.isRead
                                  ? FontWeight.normal
                                  : FontWeight.w600,
                              fontSize: 15,
                              color: article.isRead
                                  ? CupertinoColors.systemGrey
                                  : CupertinoColors.label,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (article.isStarred) ...[
                          const SizedBox(width: 8),
                          const Icon(
                            CupertinoIcons.star_fill,
                            color: CupertinoColors.systemYellow,
                            size: 16,
                          ),
                        ],
                      ],
                    ),
                    if (article.summary != null &&
                        article.summary!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        article.summary!,
                        style: const TextStyle(
                          color: CupertinoColors.systemGrey,
                          fontSize: 13,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (article.publishedAt != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(
                            CupertinoIcons.clock,
                            size: 12,
                            color: CupertinoColors.systemGrey2,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            article.publishedAt!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey2,
                            ),
                          ),
                          if (article.author != null) ...[
                            const SizedBox(width: 8),
                            const Icon(
                              CupertinoIcons.person,
                              size: 12,
                              color: CupertinoColors.systemGrey2,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              article.author!,
                              style: const TextStyle(
                                fontSize: 12,
                                color: CupertinoColors.systemGrey2,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (article.imageUrl != null) ...[
                const SizedBox(width: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Image.network(
                    article.imageUrl!,
                    width: 72,
                    height: 72,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Icon(
                        CupertinoIcons.photo,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// 切换已读状态
  void _toggleRead(WidgetRef ref) {
    final notifier = ref.read(articlesNotifierProvider.notifier);
    notifier.toggleRead(article.id);

    // 显示提示
    final message = article.isRead ? '已标记为未读' : '已标记为已读';
    _showFeedback(ref, message);
  }

  /// 切换收藏状态
  void _toggleStar(WidgetRef ref) {
    final notifier = ref.read(articlesNotifierProvider.notifier);
    notifier.toggleStar(article.id);

    // 显示提示
    final message = article.isStarred ? '已取消收藏' : '已收藏';
    _showFeedback(ref, message, isStar: true);
  }

  /// 显示操作反馈
  void _showFeedback(WidgetRef ref, String message, {bool isStar = false}) {
    // 使用 ScaffoldMessenger 显示短暂的提示
    // 注意：由于 ArticleCard 可能不在 Scaffold 中，这里需要通过 context 获取
    // 实际项目中可以使用 toast 库或全局 snackbar
  }
}

/// 滑动操作按钮组件
class SwipeActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color backgroundColor;
  final VoidCallback onTap;

  const SwipeActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 80,
        height: double.infinity,
        color: backgroundColor,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: CupertinoColors.white, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
