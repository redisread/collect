import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

/// 网络状态
enum NetworkStatus {
  online,
  offline,
}

/// 网络状态管理器
class ConnectivityNotifier extends StateNotifier<NetworkStatus> {
  final Connectivity _connectivity;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  ConnectivityNotifier({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity(),
        super(NetworkStatus.online) {
    _init();
  }

  Future<void> _init() async {
    // 检查初始状态
    final results = await _connectivity.checkConnectivity();
    state = _convertResult(results);

    // 监听网络变化
    _subscription = _connectivity.onConnectivityChanged.listen((results) {
      state = _convertResult(results);
    });
  }

  NetworkStatus _convertResult(List<ConnectivityResult> results) {
    final hasConnection = results.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet ||
        r == ConnectivityResult.vpn);
    return hasConnection ? NetworkStatus.online : NetworkStatus.offline;
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}

/// Provider
final connectivityProvider =
    StateNotifierProvider<ConnectivityNotifier, NetworkStatus>((ref) {
  return ConnectivityNotifier();
});
