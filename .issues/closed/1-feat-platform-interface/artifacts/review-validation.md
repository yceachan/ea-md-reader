# PR 验证增量复核

增量没有发现未解决的 P1 或 P2 问题。报告目录覆盖、Electron 浏览器 trace 缺失、Linux 测试隐式关闭沙箱和失败清理的 P2 验证问题已经修复。最终提交的跨平台运行仍未全部结束，因此本文不确认合入门槛通过。

本次只复核 `813db31` 之后的增量。绑定提交为 `7051129fd33295905e48dad4e10e94d15e21cc3b`。读取时工作树干净。差异包含 11 个文件，共新增 273 行、删除 25 行。本文只维护验证增量的结论，原 PR 的 12 个文件审查仍归原审查报告。

## 测试证明的范围

macOS 的 [packaged-mac.spec.cjs](/home/pi/work/ea-md-reader-macos-review/tests/packaged-mac.spec.cjs:36)调用真实 `/usr/bin/open -a`，指定本次隔离安装的 `.app` 和新文档。测试没有替换 `open`、LaunchServices 或产品的文件打开处理。随后测试在原 Playwright 窗口中等待新文档标题，并确认窗口可见且聚焦。这能证明运行中实例的真实系统分发。

测试的首次启动仍通过打包可执行文件完成。它没有用 `open -a` 执行冷启动，因此不证明启动前的 Finder 文件事件时序。共享 UI 用例中的 `app.emit('open-file')` 也不能替代该原生证据。两种证据的用途保持分开。

macOS smoke test 使用当前架构的打包 `.app`，执行实际用户级安装、签名验证、升级替换和重复卸载。测试还验证 DMG 的完整性。它没有挂载 DMG 后启动其中的应用，也没有从 ZIP 解压后安装，因此不证明这两种人工安装流程。

Linux smoke test 使用 `release/linux-unpacked/emd`，读取有 BOM 与 CRLF 的源文件，并确认原始字节保持不变。共享 UI 使用 Xvfb 与 Openbox。该环境证明 Linux X11 UI，不证明 KDE 原生 Wayland 定位。条目 4 的 KDE 原型证据不归本文。

## 沙箱与窗口状态

[electron/main.cjs](/home/pi/work/ea-md-reader-macos-review/electron/main.cjs:103)仍使用 `sandbox:true`、`contextIsolation:true` 和 `nodeIntegration:false`。增量没有向产品加入 `--no-sandbox` 或关闭渲染进程沙箱的配置。测试夹具 [electron-fixture.cjs](/home/pi/work/ea-md-reader-macos-review/tests/electron-fixture.cjs:5)显式传入 `chromiumSandbox:true`，当前调用点没有覆盖此值。

此设置修复了测试中的隐式关闭。锁定的 Playwright 1.63.0 在 Linux 的 `Electron.launch` 中，默认加入 `--no-sandbox`，除非传入 `chromiumSandbox:true`。此前设置了 SUID 辅助程序权限，但 UI 测试仍通过 Playwright 关闭沙箱。产品源码本身没有因此改变。[Electron 的沙箱文档](https://www.electronjs.org/docs/latest/tutorial/sandbox)说明了命令行关闭沙箱与渲染进程配置的区别。

[ci.yml](/home/pi/work/ea-md-reader-macos-review/.github/workflows/ci.yml:47)先生成应用与归档，再在 Linux runner 上把 `node_modules/electron/dist/chrome-sandbox` 和 `release/linux-unpacked/chrome-sandbox` 设置为 `root:root`、模式 `4755`。Electron Builder 默认重新解压 Electron ZIP，因此只修改 `node_modules` 辅助程序不能覆盖打包后的程序。最终工作流处理了两个位置。发布 TAR 在权限修改前生成，上传对象是该归档，权限修改没有写入发布归档。

[窗口 resize 同步](/home/pi/work/ea-md-reader-macos-review/electron/main.cjs:132)读取真实 `window.isMaximized()` 后通知渲染层。该改动没有写入假的最大化状态。Electron 44.5.1 的 [macOS 原生窗口实现](https://github.com/electron/electron/blob/v44.5.1/shell/browser/native_window_mac.mm)通过原生 `isZoomed` 读取状态，而程序设置窗口矩形能改变该状态。[原生窗口代理](https://github.com/electron/electron/blob/v44.5.1/shell/browser/ui/cocoa/electron_ns_window_delegate.mm)只在 zoom 路径结束时发送 maximize/unmaximize，普通 resize 也会发送 resize。因此补充 resize 同步符合此差异。

测试把普通窗口尺寸限制在当前工作区内，并轮询原生最大化状态为 `false`，随后点击实际最大化和还原按钮。这个前置条件避免把小屏幕的自动尺寸约束当成固定 1180×850 的普通窗口。测试没有跳过按钮行为，也没有 mock `isMaximized()`。本复核没有执行 macOS 本机 GUI，只核对源码与 CI 的实际平台结果。

## 失败证据与修复归属

复核在 `79a418c` 发现两个证据问题。Reader 与 packaged 两次 HTML reporter 都写默认 `playwright-report`，后一轮会删除前一轮 HTML。Playwright 的自动 trace 又没有启动 Electron 的外部 BrowserContext，因此自动 runner trace 缺少浏览器快照。主代理在 `92cfa8d` 将 HTML 目录分为 `playwright-report/reader` 与 `playwright-report/packaged`，并显式启动 BrowserContext tracing。独立 trace 使用 `electron-context-trace.zip`，避免覆盖 runner 的 `trace.zip`。本复核没有改写 CI 或测试代码。

最终测试夹具记录启动后的 Electron stdout/stderr 到 `electron-process.log`。macOS 安装启动器的 `emd.log` 在临时目录删除前附加到测试结果。第二实例失败的信息保留了退出信号与输出。[工作流上传步骤](/home/pi/work/ea-md-reader-macos-review/.github/workflows/ci.yml:84)使用 `always()`，保留两个报告目录、测试结果、DMG、ZIP 和 TAR。普通构建输出仍进入 GitHub job log。

已独立读取本地三个 `electron-context-trace.zip`。它们均包含 `trace.trace` 与 `trace.network`。两份共享 UI trace 分别包含 52/86 条 API before 记录、31/57 个 screencast frame 和 7/2 个资源。它们没有 frame-snapshot。Linux packaged trace 包含 6 个 frame-snapshot。浏览器动作与图像证据已保存，DOM 和网络覆盖需要按每份 trace 的实际内容判断。

复核随后发现一个 P2 失败清理边界。macOS packaged 用例原先在 `finally` 中首先执行 `await close(application)`。如果 Electron 崩溃或 `tracing.stop` 失败，该异常会跳过后面的启动器日志附加、卸载和临时目录删除。主代理在 `7051129` 加入嵌套 `try/finally`，使这些步骤独立执行。复核确认代码仍传播故障，没有把清理失败写成成功。

同一边界还影响夹具的启动函数。`tracing.start` 在创建应用后执行。如果它失败，调用者的 `application` 尚未赋值。`7051129` 在启动函数内关闭已创建的应用，再传播原错误。如果关闭也失败，它用 `AggregateError` 保留两个故障。此修复只涉及测试生命周期。

复核用内存中的故障注入执行了夹具的真实源码。trace 启动失败时，应用关闭函数执行。trace 启动和关闭同时失败时，两个错误均保留。trace 停止失败时，应用仍关闭。该检查没有写入文件或创建原生进程，它只证明错误分支，不替代原生 Electron 测试。

## 提交与运行证据

本复核读取了原生失败日志。`/tmp/emd-ci-linux-round2.log`记录了第二实例因辅助程序权限错误退出的 SIGTRAP。`/tmp/emd-ci-arm64-round2.log`记录了普通窗口按钮状态失败。它们解释对应修复的触发条件，不能作为当前提交的通过证据。

已独立读取 [旧提交 79a418c 的 run](https://github.com/Lysssyo/ea-md-reader/actions/runs/37483945164)。macOS arm64、macOS x64 和 Ubuntu x64 均成功。该 run 不包含最终的报告、trace 与显式沙箱修复，不能替代最终提交运行。

最终提交 `7051129fd33295905e48dad4e10e94d15e21cc3b` 的 [run 37485765536](https://github.com/Lysssyo/ea-md-reader/actions/runs/37485765536)已完成。主协调者读取最终结果：macOS arm64、macOS Intel x64 和 Ubuntu x64 的三个 job 全部成功。结果保存在同目录 `ci-pr1.json`，其中 headSha 与本文最终提交一致。前一提交 `92cfa8d` 的运行只作历史证据。没有拼接不同 HEAD 的成功记录。

本地只读检查通过。四个新增或改写的 CJS 测试文件通过 `node --check`。`git diff 813db31 HEAD --check`通过。已有 8 档 PNG 的尺寸与透明通道符合 16、24、32、48、64、128、256 和 512 像素的请求。图标统一使用锁文件中的 resvg，SVG 设计源未变。

如果后续修复生成新提交，需要重新绑定本文的提交与 CI 结果。最终三个平台结果已取得。平台接口和 Windows 共享验证仍属于后续阶段。本文不重复原 PR 的安装器与平台边界审查。
