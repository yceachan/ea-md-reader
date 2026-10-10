---
title: Windows 实机 CI 失败审计与外部编辑器禁止 detach
created: 2026-10-10
status: completed

---


# 结论

Windows 11 实机在未激活的隔离桌面中复现了最新 CI 的两处失败：Reader 的断言把缩小页面后的实际边框宽度当成了横向错位；Appica 用例在窗口创建完成前调用 `setSize()`，随后应用清理挂起，最终报告超时。两处失败都不能通过套用开发机的分辨率、系统缩放或放宽固定像素阈值来修复。

本次提交只修改共享外部编辑器启动策略：显式使用 `detached: false`，移除 `child.unref()`，保留退出状态和错误观察。UI spec、CSS、CI workflow 均未修改。窗口就绪顺序调整仅在临时对照实验中实施，不是本次提交的 UI 修复。

## 环境与范围

对照 CI 为 [Desktop validation / 38041403692](https://github.com/yceachan/ea-md-reader/actions/runs/38041403692)，源码为 `0c34b07e6ff42ab94678b1999872e6f88a75ec2b`。Windows 工作区为 `C:\Eachan\Workspace\work\ea-md-reader`，操作系统为 Windows 11 `10.0.22631.4169`，测试使用 Electron `44.5.1`、Electron 内置 Node `24.21.0`、外部 Node `24.20.0`。

通过 SSH 执行项目的 `scripts/test-ui-windows.ps1`。测试桌面位于非交互 Service window station，脚本只创建桌面，从未切换或激活它。该会话实际报告一个 `1024×768` DIP 工作区、`scaleFactor = 1`。这些是隔离会话的观测值，不代表用户前台显示器，也不代表所有 Windows runner。测试窗口可以大于该工作区；对照实验中 `setSize(1600, 850)` 成功，不能把启动工作区大小误认为所有后续窗口的上限。

未在用户桌面启动 Reader、DevTools 或 Typora。未验证 Windows Shell 吸附，也未进行 macOS 实机实验。页面 zoom 的变化不等价于更改 Windows 显示缩放；125%/150%/200% 系统 DPI 和多屏仍不在本次验证范围内。

## 基线复现

运行 `npm run test:ui -- tests/ui.spec.cjs tests/reader.spec.cjs --grep 'Appica|工作区切换' --reporter=line,json`。该表达式还命中了 HTML 工作区切换用例，结果为 1 通过、2 失败，另有 worker teardown 超时。没有重试或把失败算作通过。

### Reader：边框不是错位

`tests/reader.spec.cjs:336` 比较目录按钮外框与目录面板外框的 x 坐标，并要求差值不超过 1 CSS px。测试先按工作区宽度的 80% 设置窗口，再使用 `getContentBounds().width / 1600` 设置页面 zoom。

实机得到内容宽度 819 DIP、zoom `0.511875`、页面视口宽度 1600 CSS px。此时 `.outline` 的 `border-left: 1px` 经 Chromium 像素取整后，computed style 为 `1.9536px`，按钮与面板外框的差值为 `1.95361328125` CSS px，正好对应这条边框。垂直中心差约为 `-0.0153` CSS px。将页面 zoom 恢复为 1，边框及横向差值都回到 1 CSS px。

这证明该失败来自测试比较了不同的盒模型边缘，而不是按钮在 Windows 上额外偏移了约 2px。后续应先明确产品要求对齐面板外边缘还是内边缘，再按真实 computed border 和盒模型验证；不应把容差机械改为 2，也不应固定成开发机缩放后的尺寸。

### Appica：窗口创建竞态被清理超时遮挡

原用例在 `application.firstWindow()` 之前执行 `BrowserWindow.getAllWindows()[0].setSize(1600, 850)`。基线 trace 的 `pw:api@38` 记录到 `TypeError: Cannot read properties of undefined (reading 'setSize')`，调用位置为 `tests/ui.spec.cjs:23`。随后 `Stop tracing` 完成，但 `Close context` 没有结束；测试和 worker teardown 各自超过 90 秒。最终终端输出主要表现为超时，不能据此判断 `setSize()` 自身卡住或 DPI 不匹配。

临时对照副本只把 `firstWindow()` 移到 `setSize()` 前，保留原用例的功能断言和原来的尺寸调用。预览/编辑切换、手动保存、自动保存、外部修改冲突、保留和放弃草稿全部通过。两项临时实验（Appica 对照与几何测量）共 2 通过；临时 spec 已删除，没有修改永久 UI spec。

## 禁止 detach 的改动及验证

`electron/platforms/editor.cjs` 的 `startProcess()` 不再使用 detached 进程，也不再调用 `unref()`。这覆盖共享模块直接启动的 Windows、Linux 和 macOS 编辑器/启动器，保留 `completion` 与 `waitForFile` 的原有语义。

新增测试用受控无头编辑器和文件握手验证真实进程生命周期：编辑器仍在等待释放时，父 Node 进程不能自然退出；释放编辑器后，两者正常结束。该测试在 Linux、Windows 的旧实现上均失败（父进程提前退出，exitCode 为 0），在新实现上均通过。已有原生编辑器参数、失败退出和 VS Code `--wait` 测试不再需要人工 keep-alive 来掩盖丢失引用。

验证记录见 `evidence.json`。Linux 受影响 Node 测试 8 通过；Windows 受影响 Node 测试 8 通过、1 项 Linux 专用跳过。Windows 原有 `tests/editors.spec.cjs` 两项 UI 回归均通过（4.8 秒），使用受控无头编辑器，没有启动用户的 Typora。类型检查及 `git diff --check` 通过。LSP 检查没有提供全部文件的 clean 确认；已显示的两条 await-member 提示属于既有代码，类型检查用于补充验证。

## 仍需单独处理的生命周期问题

禁止 detach 和保留引用解决的是主动脱离与父进程自然退出，不保证 Electron 强制退出、崩溃或编辑器再次派生进程后，整个编辑器进程树自动结束。macOS `open`、Linux `gio` 还可能把应用启动交给系统服务。不能据此宣称所有后台残留已消除。若要求随 Reader 退出回收整个进程树，需另外设计明确的退出确认及平台进程管理策略，避免丢失用户未保存的外部编辑内容。

此前 Typora 的 4 个进程持有 emd 安装目录句柄。当前共享启动函数仍未显式指定 `cwd`，所以编辑器可继承 Reader 的工作目录；禁止 detach 不会改变这个工作目录，也不能单独保证安装目录不再被占用。使用文档所在目录作为编辑器 cwd 应作为后续独立修复。
