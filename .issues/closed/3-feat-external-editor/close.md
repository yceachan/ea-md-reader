# Issue 3：外部编辑器首版交付

2026-10-07 按用户确认的首版范围关闭。Markdown 与 HTML 编辑器分别保存到 `setting.toml`；工作树中键、文件与标签菜单操作目标文件，标签中键继续关闭。KDE/Linux 使用系统应用选择器并保存 `.desktop` 路径，支持没有执行位的应用条目；临时“打开方式”保持现有配置。

保存、支持等待的文件会话结束与 Reader 恢复焦点共用快照更新。同一路径的所有仍打开标签一起刷新，保留活动标签与 Markdown 阅读位置，HTML 使用新预览快照；失败明确报告并保留最后成功内容，已关闭标签保持关闭。Reader 退出释放自身监听，用户编辑器继续由用户管理。

关闭范围为 Linux/KDE 首版及共享编辑契约。普通启动器退出不视作文件关闭；Linux VS Code 文件等待已有实测，macOS/Windows 的真实编辑器验证仍未完成。Android 外部编辑入口限制随 [issue 5](../../open/5-feat-android/issue.md) 后续实施。

运行验证见 [artifacts](/home/pi/.codex/artifacts/ea-md-reader/repository-cleanup-20261007-222101/verification.md)。
