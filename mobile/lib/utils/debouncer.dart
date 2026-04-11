import 'dart:async';

/// 防抖工具类
/// 用于延迟执行某个操作，常用于搜索输入框
class Debouncer {
  final int milliseconds;
  Timer? _timer;

  Debouncer({required this.milliseconds});

  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(Duration(milliseconds: milliseconds), action);
  }

  void cancel() {
    _timer?.cancel();
  }
}

typedef VoidCallback = void Function();
