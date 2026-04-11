import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// 阅读进度条组件
/// 显示在 AppBar 底部，表示当前阅读进度
class ReadingProgressBar extends StatelessWidget implements PreferredSizeWidget {
  final double progress; // 0.0 - 1.0

  const ReadingProgressBar({
    super.key,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 2,
      color: CupertinoColors.systemGrey5,
      child: LinearProgressIndicator(
        value: progress,
        backgroundColor: CupertinoColors.systemGrey5,
        valueColor: AlwaysStoppedAnimation<Color>(
          CupertinoColors.activeBlue.resolveFrom(context),
        ),
        minHeight: 2,
      ),
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(2);
}
