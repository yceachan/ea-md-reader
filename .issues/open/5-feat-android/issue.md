# 5：Android 工具链与适配方案

状态：规划文档已整理，Android 实施未开始。日期：2026-10-06。来源：用户请求“feat5 : 列出安卓端适配工作，toolchains依赖与适配方案。”本文维护规划范围、现状证据和文档验收。

本轮只整理方案，不安装 SDK，不增加运行时依赖，不创建 Android 工程，也不生成 APK。工具链清单由 [route](route.md)维护，架构取舍由 [ADR-005](adr.md)维护。

用户随后明确移动端删除“在编辑器打开”功能。删除范围包含默认编辑器设置、在配置编辑器中打开、编辑器打开方式、编辑会话等待和相应原生启动接口。文件阅读、另存为、外部网页链接、工作树菜单及平台调试不因此被删除。

## 规划范围

| 编号 | 需要整理的内容 |
| --- | --- |
| R5.1 | 给出适合当前 React/Vite 工程的 Android 运行时路线，并说明可复用部分和平台重写部分。 |
| R5.2 | 列出 Node、Java、Android SDK、Gradle、原生插件、设备测试与打包依赖。区分必需和可选依赖。 |
| R5.3 | 规划文件打开、工作区授权、原始字节另存为、相对资源、链接及重新读取。移动端不实现编辑器打开功能。 |
| R5.4 | 规划手机、平板、横竖屏、分屏、软键盘、返回键和触摸操作，复用条目 4 的覆盖层规则。 |
| R5.5 | 规划 Markdown 与交互 HTML 的隔离边界、原生接口权限、离线资源和性能验证。 |
| R5.6 | 列出 Android 构建与设备 CI、产物和分阶段完成证据。明确规划尚未验证的项目。 |

原始请求要求列工作和方案，没有确定上架渠道和最低项目支持设备。路线可以提出候选值，但不得把它们记录为用户已经批准的发行承诺。

## 仓库与环境证据

F5.1：当前 UI 是 React 19、TypeScript、Vite 7。Markdown 阅读使用 marked、DOMPurify、KaTeX、Shiki、Mermaid 和图片交互。阅读组件有复用基础，但 Android System WebView 的兼容性与性能未测试。

F5.2：桌面运行时为 Electron 44.5.1。`electron/main.cjs` 处理 Node 文件访问、原生菜单、自定义协议、单实例、窗口和查找。`electron/preload.cjs` 暴露 `window.emd`。`src/env.d.ts` 的文档与树节点以路径为标识，当前 UI 还拆分 `/`。Electron 官方覆盖 Windows、macOS 和 Linux，本项目没有 Android 运行时。[Electron 介绍](https://www.electronjs.org/docs/latest/)支持这个平台边界。

F5.3：`Article.tsx` 把相对图片改写为 `emd-asset://`，链接交给主进程按磁盘路径解析。HTML 通过 `emd-page://` 和受限 iframe 加载。Android 无法直接复用 Electron 的协议注册、IPC、文件监控和 `findInPage`。

F5.4：Android 的文档提供器通过 `content://` URI 授权文件访问。它不保证可取得普通磁盘路径，单个文件授权也不自动授予父目录与邻接资源。目录树和长期授权需要专门处理。[Android 文档访问说明](https://developer.android.com/training/data-storage/shared/documents-files)是文件端口适配依据。

F5.5：2026-10-06 本机只读检查显示主机为 x86_64，Node 为 22.23.1，npm 为 10.9.8，`java -version` 为 OpenJDK Runtime 25.0.4.1。在当前 PATH 中没有找到 `javac`、`adb`、`sdkmanager`、`emulator` 或 `gradle`。这只说明当前命令环境，不代表磁盘上完全没有 SDK。Android Studio 和虚拟化能力尚未检查。

F5.6：仓库没有 `android/`、Capacitor 配置或 Android CI。现有 `npm run build` 会先生成 Electron 图标，使用本机图标工具。Android 的前端构建需要从桌面打包准备中分离。

## 差异与待验证事项

B5.1：直接把原始 HTML 放进带原生桥的 WebView 会扩大权限。Android 的 `addJavascriptInterface` 可被 WebView 的所有 frame 访问，仅添加 iframe sandbox 不能作为足够证据。[Android 原生桥说明](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)记录该风险。

B5.2：编辑器打开已从移动端范围删除，条目 3 的编辑会话验收仅适用桌面。Android 保留文件重读与前台恢复，不增加编辑器配置、编辑 Intent 或等待完成协议。

B5.3：框架的最低 Android/WebView 支持版本不代表现有阅读 CSS、Shiki 和 HTML 交互都能运行。项目最低支持版本必须经过离线渲染与设备测试后确定。

B5.4：分享入口的临时授权、目录授权撤销、文档提供器无网络或不支持写入，会改变可用操作。界面要明确显示权限与错误，不能静默复制到缓存后仍声称读取的是原文档最新内容。

## 文档验收

| 编号 | 本条目完成证据 |
| --- | --- |
| A5.1 | ADR 明确推荐路线、候选替代路线和复用边界，未验证决定有标注。 |
| A5.2 | route 给出有官方依据的工具链清单、版本核查基线与本机缺口，且不把 JRE 当成完整 JDK。 |
| A5.3 | 文档逐项覆盖 R5.3 至 R5.5，并说明 URI、授权、HTML 原生桥以及编辑器功能的排除范围。 |
| A5.4 | route 按最小原型、文件能力、界面、恢复和 CI 分阶段，列出实际完成证据。 |
| A5.5 | 与 ADR-001、ADR-003、ADR-004 的差异集中记录，且原有桌面需求不被 Android 规划悄然降低。 |

以上是本次规划文档的验收。未来 Android 功能验收要在选择运行时、最低设备范围与发行方式后单独固定。决策见 [ADR-005](adr.md)，工具链和任务见 [route](route.md)。
