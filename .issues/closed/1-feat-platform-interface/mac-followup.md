# macOS 实机行为跟进

交接入口：[PR #2](https://github.com/yceachan/ea-md-reader/pull/2)，请 @Lysssyo 协助。当前未确认 macOS 产品粘贴存在故障；已确认的是自动化中原生复制成功、Cocoa paste 有时不产生输入，原因尚未定位。

请在实际 Mac 的 emd 查找框验证 Cmd+A/C/V 与编辑菜单的选择、复制、粘贴，区分实际键盘、实际菜单和测试注入的行为。若实机正常，修正自动化夹具；若实机也失败，基于最小复现修正 macOS 实现。保留当前 HTML 权限隔离，未经复现不修改产品权限策略。

确认后在此 PR 留下系统/架构、操作路径、结果和对应修复 PR。CI 的 macOS 结果继续显式保留，不作为 Linux 功能开发的阻塞门槛。现有证据入口见 [artifacts/ci-fixes.md](artifacts/ci-fixes.md)。

## 2026-10-07 本地排查与候选修复

审查快照：PR #2 head `07047be76404e09d104b2a242710fe285c7f5792`，base / merge-base `7cebdef012f4a664e064cdc88a54888779db395b`。最新 CI run `37538148564` 中 Linux、Windows、macOS arm64 成功；Intel macOS 在 `tests/commands.spec.cjs` 的原生复制断言失败，剪贴板为空。该作业的其他 UI 用例和打包应用用例成功。

本机 macOS 26.2 / arm64 的受控探针复现了失败形状：先选择查找框文字，随后等待 120 ms 延迟搜索完成，查找框会失去 DOM 焦点；窗口和 WebContents 焦点仍为 true，选区偏移仍为 0/4，原生复制却不更新剪贴板。搜索完成后重新聚焦再复制成功。进一步连续检查发现，DOM `.focus()` 仍可能让 Cocoa `selectAll:` 无动作；真实点击查找框能够恢复原生可编辑响应者。诊断期间未出现权限请求或检查回调。

实际 Mac 键盘 Cmd+A/C/V，以及 Edit 菜单 Select All / Copy / Paste，均在重新点击查找框后完成了已知测试文本的复制与替换粘贴。该结果不等价于证明任意搜索时序下输入焦点都保持不变。

本地补丁集中在 `tests/commands.spec.cjs`：观察对应查询的 `found-in-page` / `finalUpdate`，完成后点击查找框并确认焦点；把合成按键透传检查和 Cocoa 编辑动作分开；复制前设置不同哨兵，粘贴覆盖不同文本，保留实际剪贴板和选区断言。失败清理使用嵌套 finally，确保剪贴板恢复失败时也能关闭应用和清理夹具。

验证：生产构建成功；`npm run test:node` 为 30 pass / 1 Linux-only skip；原生编辑用例连续 5 次通过（11.8 秒）；`npm run test:ui` 全部 6 项通过（13.3 秒）。产品运行时、HTML 隔离与权限策略没有改变。

仍需在 GitHub 的原生 Intel macOS 15 runner 上验证该补丁。本地执行前保存并在结束后恢复了完整系统剪贴板；原测试自身仍只恢复文本，这一富格式保留边界没有由本补丁扩展。
