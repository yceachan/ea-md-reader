# Issue 8 完成

状态：已关闭，2026-10-19。源码已修复，尚未安装到本机应用。

自动查找仍在输入停顿 120 毫秒后执行。Markdown 与 HTML 查找完成后都可直接继续输入，光标和选区保留；用户点击正文或按 Tab 离开输入框时正常释放焦点。Enter、Shift+Enter 和上下按钮继续当前匹配会话。

类型检查和 4 个受影响的 Electron 场景通过。验证使用 Linux 的独立 Xvfb 与 openbox；macOS 和 Windows 未在本轮运行。

验证结果见 [artifacts/validation.txt](artifacts/validation.txt)，原始复现上下文见 [artifacts/baseline-error-context.md](artifacts/baseline-error-context.md)。
