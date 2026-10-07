# Issue 1 交付 checkpoint

按 2026-10-07 用户确认，本轮交付 Linux 可继续开发的共享平台基线，通过 PR #2 squash 合入。macOS 实机编辑行为在该 PR 由 @Lysssyo 协助确认；未完成项见 [mac-followup.md](mac-followup.md)。

共享语义命令、运行时端口、主进程工作区路径关系和四平台 CI 入口已经建立。后续 F12 使用同一命令分派，布局与编辑器按各自 issue 增量添加实际平台能力；Android 按 issue 5 单独接入 native bridge 与文档 URI 授权，现有 Electron 端口不宣称已覆盖 Android。

审查与验证记录见 [artifacts](artifacts/)。原始日志仅保留本地；其他 issue 仍保持暂停。
