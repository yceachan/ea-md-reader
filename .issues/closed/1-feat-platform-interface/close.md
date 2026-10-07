# Issue 1：Linux 开发基线交付

本关闭记录随 [PR #2](https://github.com/yceachan/ea-md-reader/pull/2) 合入主线后生效，按 2026-10-07 用户确认的交付边界判断。

macOS PR #1 已完成审查和原生验证并合入。冻结的 HTML 来源与该主线组合，保留只读、源文件保护及脚本隔离。应用现已集中定义语义命令与系统能力，Linux/macOS/Windows 端口提供实际映射，渲染层通过受限 IPC 使用主进程路径关系。

Linux 构建、共享文件/命令、Electron 阅读与交互及打包入口可继续验证。共享接口没有要求后续功能绕开平台边界；F12、设置/布局和桌面编辑器沿现有入口接入；Android 按 issue 5 独立实现 native bridge 与文档 URI 授权，具体功能仍在各自 issue 实施。Windows 共享检查与 Linux 一同作为主线门槛。

四平台验证入口已建立，macOS 实机编辑行为按用户确认交由 PR 中 @Lysssyo 协助，见 [mac-followup.md](mac-followup.md)。该交付不宣称 macOS 自动化全绿，也不包含 Windows/GNOME 安装器或公证发布。

独立审查、验证与固定来源的证据见 [artifacts](artifacts)。最终提交的必需检查与合入状态以 PR #2 为准。
