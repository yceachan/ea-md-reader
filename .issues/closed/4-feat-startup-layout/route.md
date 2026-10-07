# 4：实施与验证范围

状态：实现与本轮验证已完成并关闭。需求引用 [issue](issue.md)，产品机制引用 [ADR-004](adr.md)，最终交付归属 [close](close.md)。

| 阶段 | 范围 |
| --- | --- |
| 设置 | 统一存储 startup 分区、受限 IPC、设置单选项与平台 TODO 提示；不即时移动窗口。 |
| 计数与界面 | 当前层 Markdown/HTML 计数、专注模式初始面板与欢迎页工作树，保留窄屏覆盖层。 |
| KDE | X11 屏幕接口，Wayland 一次性 KWin 脚本及 Qt D-Bus 桥接；随 Linux 包构建与安装。 |
| 验证 | Node 计数/几何/配置与 KWin 请求模型，隔离 X11 界面，独立 D-Bus/虚拟双输出 KWin 原生 Wayland，Linux 打包启动。 |

验证只在隔离会话执行，不唤起用户桌面的 Reader、DevTools 或编辑器。原生 Wayland 检查实际 KWin 管理窗口、确认回传与请求清理；鼠标输出与活动窗口输出不同的选择逻辑另由请求模型验证。未实际覆盖的硬件组合在 issue 中保留，不写成已通过。

本轮收尾将已实现代码与 UI 调整提交到主线，开发入口恢复为 `/home/pi/work/ea-md-reader` 的 `main`，临时 worktree 与本地开发分支清理完成。
