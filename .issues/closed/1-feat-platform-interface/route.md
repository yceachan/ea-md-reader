# Issue 1：集成与验证路线

验收以 [issue.md](issue.md) 为准，机制以 [ADR](adr.md) 为准。

先冻结原工作区来源，独立审查并修复 macOS PR。在最终提交完成原生验证后 squash 合入主线。随后从主线建立唯一 issue 1 集成分支，汇总 HTML 来源、共享命令、运行时平台模块与 Windows 路径修复；审查组合差异，Linux 开发基线与共享接口审查通过后 squash 合入；macOS 实机行为按用户确认在 PR 中跟进。

issue 1 合入后，桌面收尾成果统一回到 `/home/pi/work/ea-md-reader` 的 `main`。2026-10-07 清理全部辅助 worktree、本地 PR/probe 分支与旧 stash；历史来源已存入仓库外的恢复档案，暂停的 Android 需求继续由 issue 5 维护。

| 运行机 | 共享验证 | 原生追加验证 |
| --- | --- | --- |
| ubuntu-24.04 / x64 | 类型、构建、Node 文件/命令、Electron UI | Xvfb/Openbox、图标、KDE 安装契约、Linux 档案和已打包启动 |
| macos-15 / arm64 | 同上，使用实际 macOS 键位与路径 | 菜单、Finder/Dock、app/DMG/ZIP、签名与 DMG 校验、LaunchServices 安装恢复、真实系统打开 |
| macos-15-intel / x64 | 同 arm64，断言原生 x64 | 同 arm64 |
| windows-2025 / x64 | 同上，使用 Windows 路径与原生 Electron | 明确验证不支持的安装入口；不执行 POSIX/macOS 工具夹具 |

本地构建与 Node 检查使用 `npm run build`、`npm run test:node`。按用户要求，Linux 的 Electron UI 检查使用 Xvfb 独立 DISPLAY 与 Openbox，不使用开发者的桌面会话。命令为 `xvfb-run -a -s '-screen 0 2560x1440x24' sh -c 'openbox >/tmp/emd-openbox.log 2>&1 & npx playwright test --reporter=line'`。`npm run pack -- --platform=kde` 或 `mac` 创建支持平台的档案；已打包测试使用 `playwright.packaged.config.cjs`。

CI 对应 `.github/workflows/ci.yml`。矩阵不提前取消其他平台，产物保留 7 天。Electron 夹具显式保存进程输出与 API 追踪；追踪不代表完整 DOM/网络取证。失败应从对应日志、截图和报告判断，不以模拟平台参数替代原生结果。

合入门槛：共享接口与 Linux 基线审查没有未解决的 P1/P2，最终提交的 Linux/Windows 作业通过。按用户 2026-10-07 确认，main 必需检查为 Linux/Windows，macOS 两个作业继续运行并保留真实结果，实机问题在 PR #2 请 @Lysssyo 协助，不转为静默成功。保护仍应用于管理员并要求线性历史、禁止强推和删除。仓库配置记录见 artifacts/main-protection.json。

macOS 的合成键盘输入未分发 Cocoa 编辑 selector；测试分别确认应用不消费复制键，并调用原生 first responder 验证编辑行为，不把它宣称为物理键盘取证。PR 打包显式允许无凭证的 ad-hoc 签名；不引入 Developer ID。Windows 全屏以实际显示器边界和退出后原窗口恢复判定。
