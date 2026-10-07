# PR #1 macOS 审查记录

F1.7 在注册状态桩中复现，修复提交为 `813db31`。首次安装和升级在注册成功后提交启动器失败时，原实现都留下新包的注册信息。修复后的 Linux 检查通过。macOS 原生用例已经加入，当前机器无法执行这两条用例。后续最终 head `7051129` 的两种 macOS 架构原生检查已通过，F1.7 的系统注册状态闭环。最终运行结果以同目录 `ci-pr1.json` 为执行证据。

审查来源是 PR base `2cc490b59291c2569058c06142b9b2035808056d` 与 PR head `88131ae3207975cb7e88c7c8e8d78da664bdd39d` 的完整差异。审查覆盖全部 12 个文件：`README.md`、`electron/main.cjs`、`package-lock.json`、`package.json`、`playwright.config.cjs`、`scripts/platforms.mjs`、`scripts/platforms/mac.mjs`、`scripts/render-icons.mjs`、`tests/files.test.cjs`、`tests/mac-platform.test.mjs`、`tests/platforms.test.mjs`、`tests/reader.spec.cjs`。本记录维护该快照的审查结论与本子任务证据。需求与验收继续以 [raw issue](raw-issue.md) 为来源。

复现用例先完成 `lsregister -f`，再删除 `.local/bin/.emd-install-*` 临时启动器。最终 `rename` 抛出 `ENOENT`。首次安装用例发现，目标应用目录已经删除，注册状态桩仍保留 `version two`。升级用例发现，应用目录恢复为 `version one`，注册状态桩仍保留 `version two`。修复前这两条测试都失败。该故障属于 F1.7 的 P2 问题。

修复先注销仍在目标路径的新包，再恢复旧包目录。存在旧包时，修复强制重新注册旧包。注册命令自身失败时也执行恢复，因为失败返回不能证明数据库没有发生部分写入。注销失败与重新注册失败不会中断文件恢复。程序用 `AggregateError` 同时保留原故障和恢复故障，错误文本也包含各故障原因。文件恢复失败时，原有旧包保留规则仍生效。

新增检查覆盖首次安装、升级、注销失败和旧包重新注册失败。检查包含原启动器字节、源包可执行文件字节、框架链接、目标目录和临时文件清理。已有检查继续覆盖应用标识、无关命令、目标符号链接、可执行权限、复制失败、注册失败和重复卸载。修复没有修改应用归属判断、可执行文件保护或源文档读写逻辑。

2026-10-06 在 Linux 的 Node.js `v22.23.1` 上执行 `node --test tests/mac-platform.test.mjs`，13 项通过，2 项原生用例跳过。此结果证明恢复调用协议与文件操作。`plutil`、`ditto` 和 `lsregister` 在这些跨系统用例中是桩。共享 Node 检查的一次前置执行得到 17 项通过、1 项失败。失败是 KDE 测试需要的 `assets/icons/16.png` 尚未由 build 生成。完整 build 与共享检查由主任务统一执行。

两条原生用例只在 macOS 执行。它们调用真实 `plutil`、`ditto` 和 `lsregister`，仅注入临时启动器消失的故障。旧包与新包各自声明唯一扩展名。用例先读取目标路径的 bundle 记录及其 claim 的 `bindings` 字段，确认新包已经注册，再触发最终启动器提交失败。恢复后，用例要求首次安装不再有目标记录，升级恢复旧包绑定且没有新包绑定。原输出保存在 `test-results/mac-registration/<arch>-first-install/` 与 `test-results/mac-registration/<arch>-upgrade/`。

`lsregister -dump` 是诊断输出，其格式没有稳定公开接口保证。解析要求存在 `bundle id`、目标 `path`、claim 的 `bundle` 与 `bindings` 字段。无法识别输出时，用例明确失败，并保存原输出。测试不会把解析失败或缺少正向注册证据报告为恢复成功。该解析器仍需在 CI 的两个 macOS 运行机首次确认。[Apple 的注册说明](https://developer.apple.com/documentation/coreservices/1446350-lsregisterurl)说明注册会加入应用及其文档绑定。[Apple 的 Launch Services 指南](https://developer.apple.com/library/archive/documentation/Carbon/Conceptual/LaunchServicesConcepts/LSCConcepts/LSCConcepts.html)要求应用的注册信息发生变化后重新注册。诊断记录结构参考了 [Apple Developer Forums 中开发者提供的实际输出](https://developer.apple.com/forums/thread/783646)，该论坛输出没有成为格式保证。

其余 PR 变更没有发现新增的确定 P1/P2 故障。`focusWindow()` 在窗口不存在或销毁时返回，恢复最小化窗口后再显示和聚焦。`open-file` 监听在 `whenReady` 前安装，提前收到的文件消息沿用既有队列。菜单变更只在 macOS 生效。关闭最后窗口即退出的行为保留。平台登记继续拒绝跨系统入口和未实现入口。resvg 的新增依赖与锁文件一致，依赖用于构建。

仍有明确证据边界。PR 快照没有 CI 检查，Intel 原生结果缺失，对应 F1.1。macOS 窗口用例通过 `app.emit` 注入文件打开与激活事件，没有证明真实 Finder 或 LaunchServices 分发，对应 F1.6。`tests/mac-platform.test.mjs` 现有 POSIX 执行与符号链接用例没有 Windows 条件，不能直接作为 Windows 共享测试，对应 F1.5。写死 Ctrl 提示、运行时平台分支和 Windows 路径关系属于 F1.2 至 F1.4 的后续边界重组。PR 只声明 Markdown 关联，HTML 组合版本仍需按 F1.8 集成。ad-hoc 签名与关闭公证是已说明的交付范围，不能证明用户下载后的 Gatekeeper 放行。

本子任务只提交 `scripts/platforms/mac.mjs` 与 `tests/mac-platform.test.mjs`。没有 push，没有提交 GitHub review 或 comment，也没有合并 PR。主任务负责 CI、真实打包应用分发、两个架构的结果与最终合入决定。
