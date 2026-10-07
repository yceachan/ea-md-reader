# Issue 1 集成 checkpoint

日期：2026-10-06。状态：macOS PR 已审查、验证并合入。HTML 集成、运行时平台接口和四平台 CI 正在实施。需求和验收只维护在 [raw issue](raw-issue.md)。平台决策只维护在 [adr](adr.md)。本文记录本次执行来源、证据和合入门槛。

## 固定来源

主线与远端 `main` 均为 `2cc490b59291c2569058c06142b9b2035808056d`。现有 15 个文件的改动和 6 个 issue 的说明保存为 `2b65320`，分支为 `codex/source-snapshot-20261006`。该提交用于恢复和集成归属，尚未合入主线。

macOS [PR #1](https://github.com/yceachan/ea-md-reader/pull/1) 的审查来源为 `88131ae3207975cb7e88c7c8e8d78da664bdd39d`。独立目录为 `/home/pi/work/ea-md-reader-macos-review`，本地修复分支为 `codex/macos-review`。主协调者负责 CI、图标构建和打包系统打开测试。审查代理负责 macOS 安装模块与恢复测试。

现有来源的 `npm test` 已通过：6 个 Node 测试，3 个 Electron UI 测试。结果包括 HTML 隔离、原始字节另存为和工作区行为。此结果不能代替 macOS 原生结果。

`git merge-tree` 显示两份来源在 README、文件测试、平台测试和 UI 测试存在内容冲突。后续集成按行为逐项保留。不能选择整份 ours 或 theirs。HTML 系统关联的扩展在现有 HTML 功能集成时处理，原 macOS PR 的关联范围仍为 Markdown。

## 审查与验证入口

详细 macOS 审查由 [review-macos](review-macos.md) 维护。F1.7 的恢复修复为 `813db31`。验证入口的增量复核由 [review-validation](review-validation.md) 维护。最终待合入 head 为 `7051129fd33295905e48dad4e10e94d15e21cc3b`。

PR 验证工作流使用 `ubuntu-24.04`、`macos-15` 和 `macos-15-intel`。每个作业核对真实 `process.arch`，执行原生构建、文件与平台测试及 Electron UI。macOS 还执行签名、DMG、隔离安装、真实 `/usr/bin/open -a` 分发、终端重开和重复卸载。失败时保留日志、截图与 trace。标签依据 [GitHub 官方运行机说明](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

图标构建统一使用 PR 已引入的 resvg，消除 Linux CI 对额外 ImageMagick 命令的依赖。跨平台运行接口和 Windows 共享测试仍属于 1.4、1.5 阶段。

最终 head 的验证运行是 [37485765536](https://github.com/Lysssyo/ea-md-reader/actions/runs/37485765536)，三个原生作业全部成功。PR 来源仓库为 `Lysssyo/ea-md-reader`，检查在其 push 工作流运行。合入前目标仓库尚未安装工作流，PR 的检查列表为空，因此本次按相同 head 的完整运行核对结果。原始结果保存在 [ci-pr1.json](ci-pr1.json)。旧 head `79a418c` 的运行只作为历史证据。

CI 中 Linux 的两个 sandbox helper 在归档产物生成后设置真实沙箱所需权限。测试显式选择 `chromiumSandbox: true`，没有加入 `--no-sandbox`。HTML 报告按 reader 和 packaged 分目录，真实 Electron 浏览器上下文保存独立追踪和进程日志。窗口缩放状态在 resize 后按原生状态同步。

现有 HTML 来源已在 `/home/pi/work/ea-md-reader-integration` 整理为候选树。候选保留 macOS 恢复、原生生命周期与新验证夹具，同时保留 HTML 隔离、字节保存、工作区和类型。macOS HTML Viewer / Alternate 关联在该候选补齐。组合本地检查为 19 个 Node 通过、2 个原生 macOS 跳过，3 个 Linux UI 通过、1 个原生 macOS UI 跳过。候选尚未进入主线。

## 合入门槛

PR #1 已于本地时间 2026-10-06 23:28 squash 合入，主线提交为 `7cebdef012f4a664e064cdc88a54888779db395b`。审批 review 绑定最终 head `7051129`。首次合入请求因 gh OAuth 凭证缺少 `workflow` 权限被 GitHub 拒绝。开发者补充权限后，主协调者重新核对 head 并完成合入。没有绕过凭证限制或改写旧主线提交。

只有最终 PR head 的 Linux、macOS arm64 与 Intel 原生验证通过，并完成恢复审查，才执行 squash 合入。记录最终 head、运行链接和合入提交。主线保留一个可审查的 macOS 功能提交。

若 CI、系统分发或恢复状态检查发现限制，先形成带运行产物的阻塞结论，再决定修复或向开发者核对。不得把缺失检查当成通过。平台接口、6.1 F12 与后续 UI 功能在该门槛通过后顺序集成。

主工作区后来出现 `.gitignore`、README、package 与 Typora 主题构建文件的新改动。这些改动不属于 `2b65320` 的来源快照，保留在原工作区。当前 issue 的集成继续使用隔离工作树，未覆盖或擅自提交这些新增来源。
