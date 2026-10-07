# 1：PR 合入与跨平台实施路线

状态：待实施。需求与验收引用 [raw issue](raw-issue.md)，边界和命令映射引用 [ADR-001](adr.md)。本文只维护执行顺序、作业分配和验证方法。

## 实施顺序

| 阶段 | 工作与改动范围 | 完成证据 |
| --- | --- | --- |
| 1.0：固定集成来源 | 重读 PR 最终提交与工作区差异。使用独立检出审查 PR，保留当前 15 个未提交文件。明确 HTML 变更的集成归属。 | 记录来源提交、集成差异和对应 A1.7 的测试范围。 |
| 1.1：完成 PR 审查 | 阅读 PR 所有文件。对 F1.7 注入“注册成功，启动器替换失败”，分别覆盖首次安装和升级。确认应用、命令和注册状态。处理复现的问题。 | 审查结论绑定实际 head。候选问题有复现结果或排除证据。 |
| 1.2：建立 PR 验证 | 新增 `.github/workflows/ci.yml` 或沿用届时已有工作流。先运行 Linux 与两种 macOS 架构的 PR 测试和打包。保存原生运行结果。 | F1.1、F1.6 闭环，支持平台的检查均通过。 |
| 1.3：合入主线 | 在最终 head 上取得上述检查结果并完成 review。采用仓库当时的合并方式合入 `main`。若 head 改变，重做受影响检查。 | 记录合并提交和 CI 链接，对应 A1.1。 |
| 1.4：建立最小平台边界 | 从 `main` 提取主进程系统依赖、命令配置与工作区路径关系。调整 preload 和类型。统一或迁移图标引擎选择。 | A1.2、A1.3 通过，源码位置与 ADR 一致。 |
| 1.5：补齐跨平台验证 | 分离 POSIX/macOS 夹具和共享测试。修复 Windows 的构建及共享运行问题。将四个系统/架构组合纳入必需检查。 | A1.4、A1.5、A1.6 通过，限制有明确记录。 |

本轮不执行这些阶段。未来实施不能在当前脏工作区直接强制切换分支、覆盖文件或合并。独立检出用于隔离审查，现有改动由后续集成阶段明确处理。

## CI 矩阵

以下是拟定运行机标签。2026-10-06 的 [GitHub 官方运行机列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#supported-runners-and-hardware-resources)列出这些标签和架构。实际创建工作流时重新确认可用性，记录 `process.platform`、`process.arch`、Node 和 Electron 版本，不只依赖标签名称。

| 作业 | 运行机 | 执行内容 | 边界 |
| --- | --- | --- | --- |
| Linux x64 | `ubuntu-24.04` | `npm ci`、类型与构建、共享 Node 测试、Xvfb 下的 Electron UI、KDE 安装、Linux 打包与启动 | 显式选择 `--platform=kde`。准备 X11、`xprop`、desktop 工具和图标依赖。 |
| macOS arm64 | `macos-15` | 共享测试、macOS 原生 UI、arm64 `.app` / DMG / ZIP、隔离安装和系统打开 | 验证真实架构为 arm64。不能使用 Xvfb 或 X11 参数。 |
| macOS x64 | `macos-15-intel` | 与 arm64 相同，在 Intel 上执行与启动 x64 产物 | 不用 Rosetta 结果替代原生 x64 运行。 |
| Windows x64 | `windows-2025` | 共享构建、文件/路径/命令测试、Electron UI、TODO 安装入口失败测试 | 无 POSIX shell 夹具。完整安装与发布产物仍未实现。 |

Linux 准备 `magick` 时必须确认镜像实际提供的命令，不能假定名为 `convert` 的工具满足现有入口。Windows 构建同样需要解决图标脚本依赖。按 ADR 统一图标引擎可以消除这项差异，是否统一由实际输出比较决定。

## 作业设计

工作流使用 `pull_request`、`push` 到 `main` 和手动触发。Node 采用满足 `package.json` 的 22.x 版本，安装使用锁文件。npm 缓存按操作系统、架构和锁文件区分。矩阵使用 `fail-fast: false`，一个平台失败时仍收集其他平台结果。

共享 Node 测试、原生 UI 和打包集成分别给出状态。可以使用同一工作流内的独立步骤或作业。Windows 必须运行共享层，不能只运行 TODO 测试就报告跨平台通过。平台专用跳过有显式原因。当前 macOS 测试中的 `/bin/sh` 部分移入 POSIX 范围。

打包步骤使用现有 `npm run pack -- --platform=...`。它本身已执行 build，工作流避免无意义的重复构建。应用测试使用仓库的 Electron，不能用普通浏览器测试代替桌面测试。

macOS 原生 UI 检查菜单、实际键盘输入、隐藏/最小化后恢复和单实例。打包集成在临时目录安装，显式传入测试 home，不覆盖运行机已有应用或默认文件关联。使用真实 `ditto`、`plutil`、`lsregister` 和 `/usr/bin/open -a` 分发文件。清理注册与安装文件，并确认源文件字节不变。

macOS 打包集成检查实际产物架构、`codesign --verify --deep --strict` 和 `hdiutil verify`。它还执行升级、失败恢复及重复卸载。ad-hoc 验证结果不能作为 Developer ID、公证或用户下载后的 Gatekeeper 放行证据。

Linux 原生图标检查保留 X11 与 `xprop` 的实际条件。KDE 缓存命令的注入测试要标明模拟范围。它不能作为完整 Plasma 或 Wayland 集成证据。

失败时保存 Node 输出、Playwright 报告、UI 截图、原生启动日志和打包日志。成功时保存支持平台的构建产物，并标注系统、架构和提交。需要保留 `.app` 内部权限与链接时，上传 ZIP/DMG，不上传摊开的目录代替可安装产物。

## 合入与结束条件

PR #1 合入以 A1.1 为门槛，最终四平台路线以 A1.2 至 A1.7 为门槛。F1.8 的 HTML 关联作为组合版本的集成项处理，不在纯 Markdown PR 的审查中假装已经完成。

主线保护需要把实际作业名称设为必需检查。仓库设置与工作流源码是两项操作，未来实施时分别记录结果。如果没有设置权限，明确记录这一限制，不宣称合入已受到检查保护。

完成后更新本 route 的阶段状态，附真实提交和运行链接。验收定义继续只维护在 raw issue 中。
