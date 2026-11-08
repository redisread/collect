import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/feed.dart';
import '../providers/feed_provider.dart';

/// 订阅源列表项
class FeedListTile extends ConsumerWidget {
  final Feed feed;

  const FeedListTile({super.key, required this.feed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedFeedId = ref.watch(selectedFeedIdProvider);
    final isSelected = selectedFeedId == feed.id;

    return ListTile(
      selected: isSelected,
      leading: feed.faviconUrl != null
          ? CircleAvatar(
              backgroundImage: NetworkImage(feed.faviconUrl!),
              radius: 12,
            )
          : const CircleAvatar(
              radius: 12,
              child: Icon(Icons.rss_feed, size: 14),
            ),
      title: Text(feed.title, overflow: TextOverflow.ellipsis),
      trailing: feed.unreadCount > 0
          ? Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${feed.unreadCount}',
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            )
          : null,
      onTap: () {
        ref.read(uncategorizedSelectedProvider.notifier).state = false;
        ref.read(selectedFeedIdProvider.notifier).state = feed.id;
      },
    );
  }
}
