# Issue 6：桌面开发者控制台交付

2026-10-07 按桌面范围关闭。F12 与文件菜单的“开发者控制台”共用语义命令，菜单与设置同属一个分隔组；欢迎页、Markdown 与 HTML 状态均可打开 Reader 应用界面的控制台。

主进程管理独立控制台窗口。重复打开复用现有窗口并恢复最小化，手动关闭后可以重建，Reader 退出同步销毁；控制台不挤压阅读区域，保留文档隔离与只读行为。

本轮包含开发启动、既有 Linux 打包与隔离 X11/Wayland 的窗口生命周期验证。Android 保持设备远程调试方案，其设备能力随 [issue 5](../../open/5-feat-android/issue.md) 后续实施。

运行验证见 [artifacts](/home/pi/.codex/artifacts/ea-md-reader/repository-cleanup-20261007-222101/verification.md)。
