# Issue 1 本轮 CI 修复审查

审查对象：`0decc43` 起的工作区差异，以及第一轮 CI artifact、对应本地日志和上次 `review-platform.md`。本轮只做静态审查，未改源码、未运行测试。

## 结论

未发现具体 P1/P2 或需求偏斜。第一轮原生 CI 确认了需要修复的故障：Windows 全屏后 bounds 已改变而 `isFullScreen()` 仍为 false；macOS 合成 Cmd+C 未更新剪贴板；PR 构建跳过了签名。当前改动分别针对这些观测结果。

Windows adapter 在 `enter-full-screen` 和 `leave-full-screen` 事件中分别赋值 `true`、`false`，状态不依赖已知失真的 `isFullScreen()`；Linux 与 macOS 共用 `fullscreen.cjs`，三端都提供 `createFullscreenToggle(window)`。主进程只在新建 `BrowserWindow` 后调用一次该工厂，并由统一命令调用返回的 toggle。平台差异留在 Windows adapter，公共调用面保持一致，符合最小真实差异准则。

Windows UI 断言在进入前记录窗口 bounds 与对应显示器 bounds；真实 F11 输入后等待窗口匹配显示器边界，再通过应用命令退出并等待原 bounds 恢复。它验证窗口几何变化和恢复路径，没有再把 Electron 的全屏状态查询当作 Windows 验收信号。

macOS 编辑夹具在 synthetic Cmd+A/C/V 后读取最近一次 `before-input-event`，断言键值正确且 `defaultPrevented` 为 false，再调用 `Menu.sendActionToFirstResponder`，并分别核实选区、剪贴板和粘贴结果。这样覆盖应用不拦截编辑键和 Cocoa first-responder 编辑效果；证据不冒称为物理键盘输入。第一轮日志的空剪贴板故障与此前 `sendInputEvent` 路径一致。

CI 设置 `CSC_FOR_PULL_REQUEST=true` 以覆盖 electron-builder 对 PR 默认跳过签名的行为。该变量目前放在 matrix job 环境中；实际打包只在非 Windows 的打包步骤运行，electron-builder 在非 macOS 上不会执行 macOS 签名，mac adapter 将 identity 固定为 `-`（ad-hoc），没有配置 Developer ID 或公证凭证。因此现有工作流的有效签名路径限于 macOS adapter 的 ad-hoc 身份。

## 合入门槛

本记录只判断修复设计和测试断言；第一轮 CI 是失败基线，不代表修复已通过原生验证。最终提交仍须取得 Linux、macOS arm64、macOS x64、Windows 四个作业成功的 CI 记录，并归档对应 run，才能关闭 issue 1 的平台验证门槛。

## Intel macOS paste 夹具同步复核

第二轮 run `37534770335` 的 Windows、Linux 与 macOS arm64 成功；Intel macOS 在 `search.fill('')` 后的 paste 结果断言失败。失败 trace 截图显示空输入框仍有焦点边框，但 trace 未记录 `stopFindInPage`，因此没有证据证明异步 Find 清理与 Cocoa paste 发生了竞争，也不能把竞争认定为根因。

新夹具差异包装当前窗口的 `webContents.stopFindInPage`，先调用原方法，再仅对 `clearSelection` 增加计数。清空输入框前读取基线计数，之后等待实际计数增加；再断言搜索框仍聚焦且为空，最后保留原来的合成 Cmd+V 未被拦截、原生 `Menu.sendActionToFirstResponder('paste:')` 以及粘贴结果断言。该观察门槛不强制重新聚焦、不额外发起 Find IPC、不使用固定等待或重试。

复核未发现此夹具改动中的 P1/P2。计数证明主进程中的 `stopFindInPage('clearSelection')` 原方法已返回，作为测试时序屏障；trace 与夹具都没有证明此前失败由 Find 清理造成，也不将它表述成 Chromium 内部选区清理已完成的证据。最终 Intel macOS 原生 CI 仍须通过，才能满足 issue 1 的四平台合入门槛。
