# 1：审查 macOS PR 并建立平台边界与 CI

状态：实施中。macOS PR 已合入，运行时平台接口与四平台 CI 正在实施。当前执行证据见 [checkpoint](checkpoint.md)。 来源：本轮用户请求。工作目录为 `/home/pi/work/ea-md-reader`。取证时本地分支为 `main`，HEAD 为 `2cc490b59291c2569058c06142b9b2035808056d`，有 15 个已跟踪文件存在未提交改动。本文维护本条目的需求、证据和验收条件。

## 原始请求

> 一. review gh pr1 mac bundle 的改动 ，合入main主线。然后确认mac端不跨平台的代码部分，目标架构应该是那些依赖具体平台实现的地方，应该是app 定义好if接口，各个平台实现port impl。 比如说快捷键部分，app里应该有统一的语义层config，再映射到不同平台的实际键位。我自己手上没mac机器，所以要搭建好 gh action 上 cross plat 的ci test。

本轮的共同限制为：“本轮不做改动，完成 cwd/.issuses/ 1，2，3 条目 的填写，整理好 raw issue , adr ,route。”因此，本轮的 PR 阅读只用于形成后续审查和实施依据。

## 需求

应用接口定义应用需要的平台能力。平台实现把这些能力转换成具体系统操作。语义命令是打开文件、另存为等应用动作。连续集成（CI）在 GitHub Actions 上自动构建和验证提交。

| 编号 | 需求 |
| --- | --- |
| R1.1 | 审查 PR #1 的 macOS 打包、安装、卸载、窗口激活和测试变更。解决审查问题后合入 `main`。 |
| R1.2 | 应用定义接口。依赖操作系统或桌面环境的实现放进对应平台模块。沿用现有打包适配器约定。 |
| R1.3 | 应用集中定义语义命令和快捷键配置。各平台映射真实键位。菜单、按钮提示和键盘事件使用同一来源。 |
| R1.4 | GitHub Actions 验证 Linux、macOS 和 Windows 的共享行为。macOS 在原生运行机验证 Apple Silicon 与 Intel。 |
| R1.5 | CI 区分共享测试、平台测试和打包测试。未实现的安装平台明确报告限制，不能显示为完整支持。 |

Windows 和 GNOME 的完整安装器不在本条目范围内。跨平台 CI 必须暴露当前共享代码的问题。它不能用跳过共享测试来掩盖这些问题。Developer ID 签名与 Apple 公证没有被本次请求纳入交付。

## PR 快照

[PR #1：Add macOS packaging and user-level installation](https://github.com/yceachan/ea-md-reader/pull/1) 在 2026-10-06 读取时为 `OPEN`。目标分支为 `main`，来源分支为 `codex/macos-packaging`。GitHub 返回 `MERGEABLE`，检查集合 `statusCheckRollup` 为空，`reviewDecision` 为空。可合并状态只说明 GitHub 没有发现合并冲突。

PR base 为 `2cc490b59291c2569058c06142b9b2035808056d`。PR head 为 `88131ae3207975cb7e88c7c8e8d78da664bdd39d`。PR 涉及 12 个文件，没有新增 `.github/workflows/` 文件。本轮没有提交 GitHub review，也没有合并或修改 PR。

PR 新增 `scripts/platforms/mac.mjs`。它生成当前架构的 `.app`、DMG 和 ZIP，安装到 `~/Applications/emd.app`，写入 `~/.local/bin/emd` 启动器。它调用 `ditto` 复制应用包，调用 `lsregister` 注册 Markdown 文件关联。它检查应用标识、可执行文件、启动器归属及目标符号链接，并提供安装失败后的旧包恢复。

PR 使用 ad-hoc 本地签名，关闭 hardened runtime 和公证。文件关联为 Markdown 的 Viewer / Alternate。它在主进程增加 Finder 文件打开时的窗口恢复、Dock 激活及 App/Edit/Window 菜单。图标在 macOS 使用 resvg，其他系统继续调用 `magick`。

PR 作者报告 Apple Silicon 上 Node 测试、3 个 Electron UI 测试、arm64 打包、签名与 DMG 校验，以及隔离安装后的真实 `/usr/bin/open -a` 冒烟测试通过。作者明确说 Intel 执行未测试。这些是 PR 描述中的报告，本轮未复跑。

## 初步审查记录

以下记录是源码审查结果。需要系统执行才能确定的行为明确标为待验证。它们不能代替最终的合入审查。

| 编号 | 证据与判断 | 后续处置 |
| --- | --- | --- |
| F1.1 | PR 没有 CI 检查结果。作者只有 arm64 实机报告。Intel 和未来合并后的组合代码缺少持续验证。 | 合入前取得 Linux、macOS arm64 与 x64 的可追溯结果。 |
| F1.2 | `electron/main.cjs` 用 `input.control || input.meta` 判断主要修饰键。`src/App.tsx` 仍写死 Ctrl 提示。PR 没有改变这一点。 | 在平台边界阶段修复命令、真实键位和提示的来源。 |
| F1.3 | `scripts/render-icons.mjs` 在脚本内部按 `darwin` 分支选择引擎。`electron/main.cjs` 直接处理 macOS 菜单和生命周期。打包适配器已有接口，运行时尚未形成同样的边界。 | 收敛真实平台差异，保留通用 Electron 与 Node 操作。 |
| F1.4 | 当前工作区 `src/App.tsx:135` 和 `Workspace.tsx:6` 用 `/` 判断父目录与后代。Windows 原生路径不满足这个不变量。 | 让主进程提供工作区关系，渲染层不拆路径。 |
| F1.5 | PR 的 `tests/mac-platform.test.mjs` 无 Windows 跳过条件，其中调用 `/bin/sh`、创建符号链接并运行 POSIX 启动器。`npm test` 显式包括该文件。 | 将 POSIX 执行与通用契约测试分开。Windows 运行自身的共享测试。 |
| F1.6 | PR 的 macOS UI 测试通过 `app.emit('open-file')` 和 `app.emit('activate')` 检查事件处理。它没有自动调用真实 Finder/LaunchServices 分发。 | CI 增加已打包应用的真实系统打开测试，不把模拟事件当成系统集成。 |
| F1.7 | 安装先注册新包，再提交启动器。[源码第 93 行起](https://github.com/yceachan/ea-md-reader/blob/88131ae3207975cb7e88c7c8e8d78da664bdd39d/scripts/platforms/mac.mjs#L93)的异常分支恢复旧包，但没有重新注册旧包或注销首次安装的新包。现有测试只注入复制失败和注册失败。注册成功后的启动器替换失败尚未覆盖。 | 这是 P2 级候选故障。先复现并检查系统注册状态。若存在残留或旧注册未恢复，修复后再合入。 |
| F1.8 | PR 的文件关联只有 Markdown。当前工作区已加入 HTML 阅读及 Linux HTML MIME 关联。这是两个来源的范围差异。 | 集成时明确 HTML 的 Finder 打开方式是否补齐。不可把 PR 宣称为已经支持 HTML 系统关联。 |

现有的应用归属检查、符号链接保护、原始字节保存和失败恢复有实际风险依据。平台边界重组必须保留这些行为。关闭最后窗口即退出是当前代码和 PR README 明确的行为，不能在重组时顺带改变。

## 平台依赖清单

| 位置 | 已发现的差异 | 边界分类 |
| --- | --- | --- |
| `scripts/platforms.mjs`、`scripts/platforms/kde.mjs`、PR 的 `mac.mjs` | 平台识别、打包目标、用户目录、desktop/MIME、LaunchServices、启动器和卸载 | 构建与安装平台实现 |
| `scripts/render-icons.mjs` | `magick` 与 resvg 的选择 | 先检查能否统一引擎。保留差异时放进构建平台实现 |
| `electron/main.cjs` | Linux desktop 名称、macOS 菜单、Dock、文件打开及快捷键 | 运行时平台实现 |
| `src/App.tsx`、`Workspace.tsx` | 分隔符假设、Ctrl 提示 | 路径关系移到主进程。提示由命令映射返回 |
| `electron/files.cjs` | `path`、`fs`、文件 URL、规范路径和硬链接身份 | 通用 Node 逻辑优先。用真实系统测试确认语义 |
| `electron/preload.cjs`、`src/env.d.ts` | 主进程与渲染层的 IPC 契约 | 应用接口，保持调用能力受限 |
| `tests/reader.spec.cjs`、平台测试 | X11、`xprop`、POSIX 脚本、macOS 事件和本机架构 | 平台测试夹具与原生 CI |

## 验收条件

| 编号 | 完成证据 |
| --- | --- |
| A1.1 | 审查记录绑定 PR 的最终提交。F1.7 已复现并闭环，或有证据证明无需修复。最终 CI 通过后，记录合入 `main` 的提交。 |
| A1.2 | 应用不直接依赖 macOS 命令、Linux desktop 集成或 Windows 专用操作。平台选择集中，平台实现满足应用接口。 |
| A1.3 | 打开、另存为、关闭标签、重读、查找、切换标签、缩放、全屏和退出有唯一语义配置。实际键位与 UI 提示一致，单次输入只执行一次命令。 |
| A1.4 | Linux、macOS arm64、macOS x64、Windows x64 均运行共享构建与行为测试。平台专属检查只能按能力跳过，日志说明原因。 |
| A1.5 | macOS 两种架构均验证打包、隔离安装、启动、文件打开、升级失败恢复、重复卸载和源文件不变。Linux 已有行为继续通过。 |
| A1.6 | CI 保存失败日志、UI 截图、测试报告及支持平台的打包产物。Windows/GNOME 安装状态保持明确。 |
| A1.7 | 现有未提交 HTML 变更和 PR 变更在后续集成中都得到明确归属，且受影响行为通过验证。 |

后续决策见 [ADR-001](adr.md)。实施与 CI 矩阵见 [route](route.md)。
