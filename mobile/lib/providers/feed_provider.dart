import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/feed.dart';
import 'auth_provider.dart';

final feedsProvider = FutureProvider<List<Feed>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final data = await api.getFeeds();
  return data.map((e) => Feed.fromJson(e as Map<String, dynamic>)).toList();
});

final selectedFeedIdProvider = StateProvider<String?>((ref) => null);
final uncategorizedSelectedProvider = StateProvider<bool>((ref) => false);
