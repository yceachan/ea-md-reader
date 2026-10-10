# Ea.Md.Reader (emd)

使用 [ea.kb,io](https://yceachan.github.io/) 排版的 Markdown 阅读与源码编辑、HTML 预览桌面应用，基于 Electron。使用自行绘制的标题栏、窗口按钮与文件菜单，窗口圆角为 10px。仓库名为 `ea-md-reader`，界面标识为 `Ea.Md.Reader`，终端命令名为 `emd`。

## Os Plat

- KDE
- Gnome (todo)
- Mac
- Windows

KDE、GNOME 是 Linux 桌面环境；`mac`、`windows` 对应操作系统。脚本的平台标识为 `kde`、`gnome`、`mac`、`windows`，`kde`、`mac`、`windows` 已接入打包、用户级安装和卸载流程；GNOME 入口返回 TODO。

## 使用

```sh
# teminal
emd 文档.md
emd "带 空格的文件.md" 第二页.md
emd 页面.html
emd file:///绝对路径/页面.html
emd
# 
#just open md file with emd
```

命令立即返回；Linux 使用 `setsid`，macOS 使用 `nohup` 独立运行，关闭终端后继续阅读。再次运行命令会将文件打开到已有窗口的新标签页；同一文件复用已有标签页。Linux 桌面应用菜单中可搜索 **Ea.Md.Reader**，Dolphin 的 Markdown 或 HTML 文件「打开方式」中可选择 **Ea.Md.Reader**；macOS 从 `~/Applications/emd.app` 或 Finder「打开方式」启动。

顶栏依次提供应用标识、工作区开关、名称、文件菜单、设置、打开和另存为，右侧保留查找、目录及窗口控制。工作区开关使用深底白线，其余按钮使用白底红砖色线条。左侧工作区以打开文件的所在目录为根，递归显示 Markdown、HTML 文件及其所在文件夹，不遍历符号链接目录。普通点击在当前标签页打开，`Alt` 点击新开标签页；空白处右键可重新载入工作树，节点菜单提供对应文件操作。进入子目录文件时保留工作区根目录，切换到工作区外的文件时以它的所在目录建立新工作区。

默认布局的工作区与目录初始展开，宽窗口中可作为侧栏展开并拖拽调整宽度。窗口不超过所在屏幕工作区半宽时，目录使用右侧覆盖层；超过半宽但剩余空间不足时也使用覆盖层。工作区达到窄宽度范围时为左侧覆盖层。覆盖层不改变正文排版，同一时刻只打开一个，支持遮罩、关闭按钮和 Esc；选择目录锚点或成功打开工作树文件后收起。窗口尺寸变化保留用户的面板开关状态。TOC 开关作为独立组件吸附在目录面板左边缘并垂直居中，带目录图标、渐变高光和立体阴影；折叠后保留入口，不占目录内容列。KDE 与 Windows 设置提供默认布局与专注阅读模式，保存后下次新窗口启动生效。默认布局使用最高 1180×850；专注模式统一统计启动 pwd 当前层的 Markdown/HTML 普通文件，零份保持默认尺寸，一份优先使用宽度 620 并隐藏双面板，多份使用工作区半宽并展开工作树、隐藏目录。默认布局与零文档使用最高 850 的高度并居中；专注模式有文档时使用工作区全高度，在鼠标所在屏幕右侧停靠。Windows 支持更窄的工作区，单文档宽度受工作区限制。无文件参数仍显示欢迎页，多文档时可从工作树打开文件。macOS 专注启动布局尚未实现。

启动偏好与编辑器、profile 共用 `setting.toml`；未配置默认使用 `default`。KDE Wayland 由一次性 KWin 脚本确认窗口几何，完成后卸载；启动失败明确显示错误。用户随后移动、缩放窗口或第二次打开文件不重新强制布局。

```toml
[startup]
layout = "default" # 专注阅读使用 "focus"
```

标签栏保持单行且不显示原生滚动条。标签较多时，鼠标滚轮上下对应栏目左右滚动；切换标签时活动标签自动进入视区。正文与 HTML 页面继续各自滚动。

工作树文件、目录与标签页右键菜单提供“复制路径”和“复制相对路径”，分别复制绝对路径和相对于当前工作区根目录的路径；工作区根目录自身的相对路径为 `.`。工作树空白处右键可“复制工作区路径”。右键后台标签不会切换活动标签。

Markdown 顶部使用 Appica ToggleGroup 的圆角“预览 / 编辑”开关，当前模式为深色。`Ctrl+/` 切换模式，编辑时用保存按钮或 `Ctrl+S` 手动保存（macOS 为 `Cmd+S`）；切换回预览时先自动保存，失败则留在编辑模式。各标签页独立保留草稿，关闭标签或在当前标签打开其他文件前也会先保存；退出时有未保存草稿会提示。源码保存保留原文件的 BOM 和 LF / CRLF 换行格式。HTML 保持预览。

打开的 Markdown / HTML 文件会尝试监听外部变化并自动重新读取，支持编辑器的原子替换保存；窗口重新获得焦点时补读遗漏变化。未改动的编辑区同步外部更新，有修改的草稿保持原样并显示冲突提示；手动保存和切回预览均拒绝覆盖已变化的磁盘版本。可复制草稿后使用“放弃草稿并重新读取”，再合并修改。监听或读取失败会提示原因并保留最后成功的内容。

另存为保存最新成功读取或保存的原始文件字节，包括 BOM、CRLF 和 frontmatter，禁止覆盖源文件及其硬链接；有草稿时先保存源码。另存为不会复制引用的图片，移动文档时需要同时保留图片及其相对位置。

设置中分别选择 Markdown、HTML 编辑器，配置保存到应用用户数据目录的 `setting.toml`。工作树文件中键、文件或标签右键的“在配置编辑器中打开”使用该编辑器；“打开方式…”只为本次选择，不改变默认配置。标签中键继续关闭标签。KDE/Linux 使用系统“打开方式”应用列表，保存所选应用的 `.desktop` 路径，由系统解释 `Exec` 与文件参数，不要求 `.desktop` 具有执行位，也不修改系统默认关联。Windows 使用原生应用选择窗口，通过 Shell 枚举该文件类型已注册且可直接启动的 `.exe` 应用，也可浏览其他程序；取消不修改配置或打开文件。macOS 可通过系统文件选择窗口选择可执行程序或 `.app`。

通过应用请求编辑后，保存会自动更新同一路径的全部已有标签，保留活动标签与 Markdown 阅读位置；HTML 使用新预览快照。VS Code 的 `code` CLI、macOS 标准 VS Code 应用包与 Windows `Code.exe` 使用 `--wait`，文件关闭时再重读。其他编辑器不推断文件关闭，依靠保存监听与 Reader 恢复焦点时重查。读取失败保留最后成功快照并报告错误，Reader 退出不会关闭用户编辑器。[VS Code CLI](https://code.visualstudio.com/docs/configure/command-line#_core-cli-options)定义了文件等待语义。

F12 或文件菜单“开发者控制台”打开 Reader 界面的独立 DevTools，已有控制台恢复并激活，关闭后可重新创建，欢迎页也可调试；控制台不挤压正文，不开启远程调试监听。

点击左上角 logo 打开居中的个人资料卡片，支持 Esc、关闭按钮和遮罩关闭。每次打开从同一个 `setting.toml` 读取 `[profile]`；文字按配置显示。项目自带头像 `public/profile-photo.jpg`，构建后随 `dist` 打包，配置中使用相对路径 `profile-photo.jpg`；也可用本地图片绝对路径覆盖，支持没有扩展名的图片。邮箱、GitHub 主页与项目仓库通过系统应用打开；仓库链接仅显示 `owner/repo`。编辑器和启动布局设置的修改保留 profile 分区；未配置或头像、链接无效时给出明确提示。

配置文件位置：开发版默认使用仓库中的 `.dev/profile/setting.toml`，Linux 安装版使用 `${XDG_CONFIG_HOME:-~/.config}/emd/setting.toml`，Windows 安装版使用 `%APPDATA%\emd\setting.toml`。下面是配置示例，程序没有内置这些个人资料默认值。开发版与安装版的设置相互独立；需要复用安装版配置时，可给 `dev` 传入对应的 `--user-data-dir`。

```toml
[profile]
name = "yceachan"
tagline = "As Eachan's Views"
email = "yceachan@foxmail.com"
github = "https://github.com/yceachan"
repository = "https://github.com/yceachan/ea-md-reader"
copyright = "copyright (c) 2026 yceachan"
license = "MIT LICENSE"
profile-photo = "profile-photo.jpg"
```

| 操作 | Linux / Windows | macOS |
| --- | --- | --- |
| 打开文件，可多选 | Ctrl+O | Cmd+O |
| 另存为 | Ctrl+Shift+S | Cmd+Shift+S |
| 关闭当前标签页 | Ctrl+W | Cmd+W |
| 切换标签页 | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab |
| 重新读取文件 | Ctrl+R | Cmd+R |
| 文内查找 | Ctrl+F | Cmd+F |
| 放大 / 缩小 / 恢复 | Ctrl++ / Ctrl+- / Ctrl+0 | Cmd++ / Cmd+- / Cmd+0 |
| 全屏 | F11 | Ctrl+Cmd+F |
| 文件菜单 | Alt+F | Option+F |
| 开发者控制台 | F12 | F12 |
| 退出 | Ctrl+Q | Cmd+Q |

中键点击关闭指定标签页；查找框内 Enter / Shift+Enter 跳转结果。菜单、按钮提示与实际键位使用同一命令定义。关闭最后窗口仍退出应用。

支持 UTF-8 文件，扩展名 `.md`、`.markdown`、`.mdown`、`.mkd`、`.mkdn`、`.mdx`（MDX 按普通 Markdown 阅读，不执行 JSX）。支持 GFM 表格、任务列表、GitHub alerts、`:::callout`、KaTeX 公式、Shiki 代码高亮、Mermaid 和图片放大。相对路径图片按当前文档目录解析；Markdown 中的 Markdown 或 HTML 相对链接打开为标签页，网页链接交给系统浏览器。

HTML 支持 `.html`、`.htm`，扩展名不区分大小写。页面保留自身排版，执行内嵌 JavaScript，并支持内嵌 CSS、数据 URL 图片和字体。打开、工作区切换、多标签、查找、另存为和重新读取均支持 HTML。HTML 使用页面自己的导航，应用目录面板只用于 Markdown。

HTML 在隔离的 iframe 中运行。页面脚本无法访问应用接口、Node.js 或父页面。页面不加载外部脚本、样式和相对资源，也不跳转到其他页面或打开新窗口。当前支持自包含页面；依赖外部资源的网页需要先将资源内嵌到 HTML 中。

## 构建与用户级安装（Linux）

构建需要 C++ 编译器、CMake 与 KDE KIO 开发库，用于原生应用选择及 KWin 启动布局桥接程序：Fedora 对应 `gcc-c++ cmake kf6-kio-devel`，Ubuntu 24.04 对应 `g++ cmake extra-cmake-modules libkf5kio-dev`。安装包包含桥接程序，运行时使用系统 Qt/KIO 库与 `gio`。

需要 Node.js 22.12+、npm、`setsid`（util-linux）及 `desktop-file-utils`，运行 Electron 需要图形会话和系统图形库。PNG 图标统一使用锁文件中的 resvg 生成。

```sh
npm ci
npm run build
npm run pack
npm run install:local
```

也可以显式选择平台，原来的不带参数命令继续可用：

```sh
npm run pack -- --platform=kde
npm run install:local -- --platform=kde
npm run uninstall:local -- --platform=kde
node scripts/install.mjs --platform=kde /路径/到/解压目录
```

不指定平台时按当前机器选择：Linux GNOME 会命中 `gnome` 的 TODO 入口，其他 Linux 环境沿用 KDE 配置（包括没有桌面环境的构建机器）；macOS 自动使用 `mac`；Windows 自动使用 `windows`。显式选择平台时仍要求匹配的主机，本轮没有实现跨系统构建。TODO 平台在构建、外部命令和安装文件写入前退出。

`pack` 生成 `release/linux-unpacked/`；发行压缩包使用 `npm run dist -- --platform=kde`，生成 `release/emd-0.1.0-linux-x64.tar.gz`。两者均使用已有构建。安装脚本将已打包应用复制到 `${XDG_DATA_HOME:-~/.local/share}/emd`，创建 `~/.local/bin/emd` 和用户级 desktop/MIME 入口，无需 root 权限。确认 `~/.local/bin` 在 `PATH` 中即可运行命令。

便携压缩包解压后可直接运行其中的 `emd` 二进制；使用终端脱离功能及桌面入口，请使用上述安装脚本。也可以给安装脚本指定解压后的目录：

```sh
node scripts/install.mjs /路径/到/解压目录
```

安装会注册 `text/markdown`、`text/x-markdown` 与 `text/html` 的打开方式，不修改默认应用设置。若要自行设为默认：

```sh
xdg-mime default io.github.yceachan.emd.desktop text/markdown
xdg-mime default io.github.yceachan.emd.desktop text/x-markdown
```

Dolphin 中键使用文件类型候选列表中的第二个应用。若希望 Markdown 默认用现有编辑器、中键固定用 emd，在 `${XDG_CONFIG_HOME:-~/.config}/kde-mimeapps.list` 的 `[Default Applications]` 中设置有序候选。例如默认编辑器为 Typora：

```ini
[Default Applications]
text/markdown=typora.desktop;io.github.yceachan.emd.desktop;
```

将 `typora.desktop` 换成所需默认应用的 desktop ID；已有配置只合并这条关联。KDE 专用配置优先于通用 `mimeapps.list`，避免 `text/plain` 的默认编辑器通过继承插到 emd 前面；`text/x-markdown` 是 `text/markdown` 的别名。保存后运行 `kbuildsycoca6 --noincremental` 刷新候选。安装和升级不修改这份配置；以后更换 Markdown 默认应用时也需要更新这里的第一项。

日志在 `${XDG_STATE_HOME:-~/.local/state}/emd/emd.log`。卸载：

```sh
npm run uninstall:local
```

## 构建与用户级安装（Windows）

需要 Windows 10/11、Node.js 22.12+、npm 和 PowerShell 7+（`pwsh.exe` 在 PATH 中），不需要管理员权限。PowerShell 7 用于注册当前用户的开始菜单快捷方式和文件打开方式。

```powershell
npm ci
npm run build
npm run pack
npm run install:local
```

`pack` 生成 `release\win-unpacked\emd.exe`。`npm run dist` 另生成当前架构的 NSIS 安装器和 ZIP，例如 `release\emd-0.1.0-win-x64.exe` 与 `.zip`。本地安装脚本将应用复制到 `%LOCALAPPDATA%\Programs\emd`，创建开始菜单入口，并把 Markdown / HTML 注册为可选打开方式，不更改现有默认应用。

Windows 使用不透明原生窗口框架与 Electron `titleBarOverlay`，由系统处理最小化、最大化、关闭和 Windows 11 最大化按钮悬停分屏菜单。工具栏保留原生拖动区，窗口最小尺寸为 330×240 DIP；较窄的分屏区域使用面板覆盖层。参见 [Electron 原生标题栏按钮](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) 与 [Microsoft 分屏命中及最小尺寸要求](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu)。Windows 10 支持拖边吸附，悬停分屏布局菜单需要 Windows 11 开启对应系统设置。

也可传入已解压的 `win-unpacked` 目录。更新前请退出正在运行的 emd；安装脚本拒绝覆盖无关应用或快捷方式，升级失败时恢复旧版本。

```powershell
node scripts/install.mjs --platform=windows "C:\path\to\win-unpacked"
npm run uninstall:local
```

卸载会移除应用、快捷方式和本安装器写入的关联，保留 `%APPDATA%\emd` 中的配置。

## 构建与用户级安装（macOS）

需要 macOS、Node.js 22.12+ 和 npm。macOS 的 PNG 图标使用 resvg 从同一 SVG 生成，无需安装 ImageMagick；ICNS 由 electron-builder 根据 `assets/emd.svg` 生成。打包采用当前机器架构：Apple Silicon 为 `arm64`，Intel 为 `x64`。

```sh
npm ci
npm run build
npm run pack -- --platform=mac
npm run install:local -- --platform=mac
```

在 Mac 上也可以省略 `--platform=mac`。`pack` 只生成应用目录；`npm run dist -- --platform=mac` 另生成发行档案：

- Apple Silicon：`release/mac-arm64/emd.app`、`release/emd-0.1.0-mac-arm64.dmg` 与 `.zip`。
- Intel：`release/mac/emd.app`、`release/emd-0.1.0-mac-x64.dmg` 与 `.zip`。

DMG 提供 `.app` 拖放安装界面；ZIP 解压后也可以打开 `.app`。安装脚本支持传入应用包或包含 `emd.app` 的解包目录：

```sh
node scripts/install.mjs --platform=mac "/路径/到/emd.app"
node scripts/install.mjs --platform=mac "/路径/到/解包目录"
```

脚本安装到 `~/Applications/emd.app`，创建 `~/.local/bin/emd`，无需 `sudo`。确保 `~/.local/bin` 在 `PATH` 中，即可使用 `emd 文档.md`。文件参数和当前目录保持原值；重复执行会复用已有窗口。日志保存在 `~/Library/Logs/emd/emd.log`。

安装将 Markdown 扩展名注册为 Viewer / Alternate，供 Finder「打开方式」选择，并保留现有默认应用。更新前请退出正在运行的 emd；脚本先复制应用包，再替换旧包，复制或注册失败会恢复原安装。它保留框架符号链接和应用元数据，拒绝覆盖无关应用、无关命令或目标符号链接。

```sh
npm run uninstall:local -- --platform=mac
```

卸载移除用户级应用与启动器，保留源文档、配置和日志，可重复执行。脚本只管理 `~/Applications/emd.app`，手动放到系统 `/Applications` 的副本需自行管理。

当前构建采用 **ad-hoc 本地签名**，不执行 Apple Developer ID 签名或公证。面向其他用户分发时需另行配置签名与公证；脚本保留应用的隔离属性，不自动修改 Gatekeeper 设置。

## 平台接入与依赖审查

`scripts/platforms.mjs` 是平台登记与选择入口，`scripts/pack.mjs` 和 `scripts/install.mjs` 负责参数解析与分派。KDE、macOS 和 Windows 实现分别位于 `scripts/platforms/kde.mjs`、`scripts/platforms/mac.mjs`、`scripts/platforms/windows.mjs`，平台打包目标和安装集成都由对应模块提供；`package.json` 保留公共构建配置。

未来接入平台时，在登记表添加模块加载函数，并实现三个导出：`packOptions`（传给 electron-builder 的平台构建选项）、`install({ root, home, source })`、`uninstall({ root, home, source })`。`root` 是仓库目录，`home` 是当前用户目录，`source` 是可选的解包产物目录；省略 `source` 时由平台模块确定默认产物位置。平台的依赖检查、安装路径、启动器、文件关联、图标注册与卸载逻辑放在自己的模块中。

| 位置 | 当前平台依赖 | 后续接入范围 |
| --- | --- | --- |
| `scripts/platforms/kde.mjs`、`assets/emd.desktop` | Linux 解包目录和可执行文件；XDG 数据/日志目录、`~/.local/bin`、`/bin/sh`、`setsid`、desktop/MIME 与 hicolor 图标；`desktop-file-validate`、`update-desktop-database`、KDE Plasma 6 的 `kbuildsycoca6` | GNOME 集成验证 |
| `scripts/platforms/mac.mjs` | 当前架构的 `.app` / DMG / ZIP、用户级 Applications、nohup 启动器、Finder 注册和卸载 | Developer ID 签名与公证 |
| `scripts/platforms/windows.mjs`、`windows-integration.ps1` | Windows 解包目录、NSIS / ZIP、用户级 Programs、开始菜单、App Paths 和可选文件关联 | 分发签名 |
| `scripts/render-icons.mjs` | 各平台通过 resvg 生成 PNG；Mac ICNS 与 Windows ICO 由 builder 从同一 PNG 源生成 | 继续以 `assets/emd.svg` 为唯一设计源 |
| `electron/platforms/*.cjs` | Linux 桌面身份、macOS 菜单/Finder/Dock、三平台键位；由 `index.cjs` 集中选择 | 新增有实际差异的平台能力 |
| `electron/commands.cjs`、`electron/main.cjs` | 语义命令生成键盘匹配、菜单 accelerator 与 UI 提示，主进程统一分派 | 后续命令使用相同定义与分派入口 |
| `electron/files.cjs`、`src/components/Workspace.tsx` | 主进程用 Node 路径语义返回工作区根目录与活动祖先，渲染层使用路径标识 | 保留 POSIX、Windows 盘符和 UNC 路径契约 |
| `electron/files.cjs`、本地资源协议 | 使用 Node 的 `path`、`fs`、文件 URL；原始字节保存和 inode 覆盖保护 | 各系统的文件系统语义、符号链接、本地资源 URL 验证 |
| `tests/reader.spec.cjs`、`tests/mac-platform.test.mjs`、`tests/windows-platform.test.mjs` | Linux 条件执行 X11 / xprop；macOS 验证菜单、Finder 文件打开、Cmd 快捷键和隔离安装；Windows 验证打包、升级回滚、系统集成与隔离安装 | GNOME/Wayland 集成验证 |

GNOME 的打包安装入口仍待接入。GitHub Actions 在 Linux x64、macOS arm64、Windows x64 原生运行机验证共享构建、文件、命令和 Electron UI，并验证各支持系统的打包安装能力。CI 报告与支持平台的档案保留 7 天。

## 开发与验证

| 命令 | 能力与产物 | 构建行为 |
| --- | --- | --- |
| `dev` | Vite + Electron；React/CSS 热更新，主进程或 preload 修改后重启 | 准备图标与原生程序，无 Vite 发布构建 |
| `start` | 当前 Electron 源码 + 已有 `dist/`，可传入文档路径 | 无 |
| `check` | TypeScript 类型检查 | 无产物 |
| `build` | 图标、原生程序与发布版渲染产物 | 完整构建，不执行检查或测试 |
| `build:renderer` | 生成 `dist/` | 仅 Vite |
| `build:native` | Linux 辅助程序，输出到 `native-build/`；其他平台跳过 | CMake 增量编译 |
| `build:icons` | 从 SVG 生成窗口与桌面 PNG | 仅图标 |
| `test` | Node 与 Electron UI 检查 | 无 |
| `test:node` | 文件、设置、平台、编辑会话等契约检查 | 无 |
| `test:ui` | 已有构建的 Electron UI 检查；Linux 创建隔离显示，Windows 创建不切换的独立桌面 | 无 |
| `test:packaged` | 已有应用包的启动、安装与文件打开检查 | 无 |
| `pack` | 可运行的应用目录，供安装和打包测试 | 使用已有构建 |
| `dist` | Linux tar.gz、macOS DMG/ZIP、Windows NSIS/ZIP，包含应用目录 | 使用已有构建 |
| `install:local` | 安装已有应用目录，注册用户级命令与桌面入口 | 无 |
| `uninstall:local` | 移除用户级安装，保留配置与日志 | 无 |

Windows 常规 UI 检查覆盖原生应用选择 GUI、最大化按钮 `HTMAXBUTTON` 命中、工具栏 `HTCAPTION` 拖动命中、最大化还原、330/400/500 DIP 窗口和零/单/多文档启动布局。测试桌面不激活，因此这组检查不证明 Explorer 的分屏浮层或真实拖边吸附。

真实 Windows 11 Shell 检查使用单独的 `Windows 11 Shell validation` 手动 CI 工作流，要求已登录、运行 Explorer 且开启分屏与悬停菜单的专用 Windows 11 虚拟机，runner 标签为 `emd-windows11-shell`。它验证悬停出现包含布局按钮的系统浮层、拖至右边缘后 `isSnapped()` 为真及分屏区域尺寸。`--windows-shell` 入口只允许声明为专用桌面的自托管 GitHub Actions runner；本机普通测试始终使用不切换的隔离桌面。没有这类 runner 时，Shell 检查仍待执行。

`dev` 使用 `.dev/profile/` 独立配置，退出时清理 Electron 与 Vite 进程。npm 与 VS Code CMake 扩展统一使用 `native-build/`，旧的 `build/` 不再使用。原生 C++ 修改后运行 `build:native` 并重启开发进程。`start` 不监听源码变化，也不更新已有渲染产物；缺少产物时，运行、测试和打包入口会报告对应准备命令。`pack`、`dist`、安装与卸载保留 `--platform` 参数。

更新源码后按 `build → pack → install:local` 顺序执行。`build` 读取当前工作树，包含已经保存到文件的暂存与未暂存改动；不需要先提交。`pack` 和 `install:local` 只使用已有产物，因此只运行安装命令不会带上新的源码改动。发行压缩包需要重新运行 `dist` 才会更新。

```sh
npm run dev                              # 日常开发
npm start -- 文档.md                      # 运行已有构建
npm run check && npm run build && npm test # 验证当前源码
npm run build && npm run pack && npm run install:local # 本地安装
```

Electron UI 使用独立虚拟显示或隔离 CI 桌面；Linux 需要 `xvfb-run`、`openbox` 与 `xprop`。测试参数直接透传，例如 `npm run test:ui -- tests/ui.spec.cjs`。macOS/Windows 使用隔离的原生桌面会话。截图、进程日志和追踪保存到 `test-results/`。

主进程负责文件与原生菜单，沙箱化渲染进程只通过限定的 IPC 接口操作已打开的文件。Markdown 中的 HTML 经 DOMPurify 清理，Markdown 文档脚本不会执行。独立 HTML 文件通过专用协议加载原始文件快照。HTML 的内容安全策略允许内嵌脚本与样式，iframe 沙箱隔离应用权限。应用自身的脚本策略保持不变。

## 排版来源

渲染器与主题来源[yceachan.github.io](https://github.com/yceachan/yceachan.github.io)

- `src/markdown.css`：原 `src/index.css` 的阅读色彩、frontmatter 和 `.vp-doc` 样式。
- `src/lib/markdown.ts`、`shiki.ts`、`slugify.ts`：原渲染链；针对桌面阅读补充 HTML 清理、属性转义和 BOM/CRLF 处理。
- `src/components/Article.tsx`：沿用原 Mermaid、图片缩放的呈现方式，加入本地图片协议和明确的错误提示。

## 开源许可

MIT [LICENSE](LICENSE)。

应用图标以 `assets/emd.svg` 为唯一设计源：暖陶色底板、展开的书页与 Markdown 符号。`npm run build:icons` 生成窗口用 PNG 和 16–512px 的桌面图标；安装时图标名称与应用 ID 一致，并给 desktop 入口写入明确的 PNG 路径。
