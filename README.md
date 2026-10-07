# Ea.Md.Reader (emd)

使用 [ea.kb,io](https://yceachan.github.io/) 排版的只读 Markdown 与 HTML 桌面阅读器，基于 Electron。使用自行绘制的标题栏、窗口按钮与文件菜单，窗口圆角为 10px。仓库名为 `ea-md-reader`，界面标识为 `Ea.Md.Reader`，终端命令名为 `emd`。

## Os Plat

- KDE
- Gnome (todo)
- Mac
- Windows (todo)

KDE、GNOME 是 Linux 桌面环境；`mac`、`windows` 对应操作系统。脚本的平台标识为 `kde`、`gnome`、`mac`、`windows`，`kde`、`mac` 已接入打包、用户级安装和卸载流程；GNOME 和 Windows 入口返回 TODO。

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

界面提供文件菜单、打开、另存为、多标签页、工作区、目录面板、查找、统一亮色主题和重新读取文件。左侧工作区以打开文件的所在目录为根，递归显示 Markdown、HTML 文件及其所在文件夹，不遍历符号链接目录。普通点击在当前标签页打开，`Alt` 点击新开标签页；右键菜单提供打开方式、在文件管理器中显示和刷新。进入子目录文件时保留工作区根目录，切换到工作区外的文件时以它的所在目录建立新工作区。顶部最左侧按钮显示或隐藏工作区。

左右侧栏均可拖拽边界调整宽度，也可聚焦边界后用左右方向键调整。TOC 使用独立面板，章节以缩进区分层级，折叠按钮位于面板左侧中央。窗口变窄时先收起 TOC，再收起工作区，保留手动展开入口；放宽窗口后恢复面板。正文使用扣除可见侧栏后的容器宽度，段落、标题、引用、代码和文档属性均随容器展开；左右边距随容器调整，不设固定阅读列宽。

源文件保持只读；另存为保存打开时的原始文件字节，包括 BOM、CRLF 和 frontmatter，禁止覆盖源文件及其硬链接。磁盘内容改变后使用重新读取命令。另存为不会复制引用的图片，移动文档时需要同时保留图片及其相对位置。

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
| 退出 | Ctrl+Q | Cmd+Q |

中键点击关闭指定标签页；查找框内 Enter / Shift+Enter 跳转结果。菜单、按钮提示与实际键位使用同一命令定义。关闭最后窗口仍退出应用。

支持 UTF-8 文件，扩展名 `.md`、`.markdown`、`.mdown`、`.mkd`、`.mkdn`、`.mdx`（MDX 按普通 Markdown 阅读，不执行 JSX）。支持 GFM 表格、任务列表、GitHub alerts、`:::callout`、KaTeX 公式、Shiki 代码高亮、Mermaid 和图片放大。相对路径图片按当前文档目录解析；Markdown 中的 Markdown 或 HTML 相对链接打开为标签页，网页链接交给系统浏览器。

HTML 支持 `.html`、`.htm`，扩展名不区分大小写。页面保留自身排版，执行内嵌 JavaScript，并支持内嵌 CSS、数据 URL 图片和字体。打开、工作区切换、多标签、查找、另存为和重新读取均支持 HTML。HTML 使用页面自己的导航，应用目录面板只用于 Markdown。

HTML 在隔离的 iframe 中运行。页面脚本无法访问应用接口、Node.js 或父页面。页面不加载外部脚本、样式和相对资源，也不跳转到其他页面或打开新窗口。当前支持自包含页面；依赖外部资源的网页需要先将资源内嵌到 HTML 中。

## 构建与用户级安装（Linux）

需要 Node.js 22.12+、npm、`setsid`（util-linux）及 `desktop-file-utils`，运行 Electron 需要图形会话和系统图形库。PNG 图标统一使用锁文件中的 resvg 生成。

```sh
npm ci
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

不指定平台时按当前机器选择：Linux GNOME 会命中 `gnome` 的 TODO 入口，其他 Linux 环境沿用 KDE 配置（包括没有桌面环境的构建机器）；macOS 自动使用 `mac`；Windows 命中 `windows` 的 TODO 入口。显式选择 KDE 时仍要求 Linux 主机，本轮没有实现跨系统构建。TODO 平台在构建、外部命令和安装文件写入前退出。

产物在 `release/linux-unpacked/` 和 `release/emd-0.1.0-linux-x64.tar.gz`。安装脚本将已打包应用复制到 `${XDG_DATA_HOME:-~/.local/share}/emd`，创建 `~/.local/bin/emd` 和用户级 desktop/MIME 入口，无需 root 权限。确认 `~/.local/bin` 在 `PATH` 中即可运行命令。

便携压缩包解压后可直接运行其中的 `emd` 二进制；使用终端脱离功能及桌面入口，请使用上述安装脚本。也可以给安装脚本指定解压后的目录：

```sh
node scripts/install.mjs /路径/到/解压目录
```

安装会注册 `text/markdown`、`text/x-markdown` 与 `text/html` 的打开方式，不修改默认应用设置。若要自行设为默认：

```sh
xdg-mime default io.github.yceachan.emd.desktop text/markdown
xdg-mime default io.github.yceachan.emd.desktop text/x-markdown
```

日志在 `${XDG_STATE_HOME:-~/.local/state}/emd/emd.log`。卸载：

```sh
npm run uninstall:local
```

## 构建与用户级安装（macOS）

需要 macOS、Node.js 22.12+ 和 npm。macOS 的 PNG 图标使用 resvg 从同一 SVG 生成，无需安装 ImageMagick；ICNS 由 electron-builder 根据 `assets/emd.svg` 生成。打包采用当前机器架构：Apple Silicon 为 `arm64`，Intel 为 `x64`。

```sh
npm ci
npm run pack -- --platform=mac
npm run install:local -- --platform=mac
```

在 Mac 上也可以省略 `--platform=mac`。产物为：

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

`scripts/platforms.mjs` 是平台登记与选择入口，`scripts/pack.mjs` 和 `scripts/install.mjs` 负责参数解析与分派。KDE 和 macOS 实现分别位于 `scripts/platforms/kde.mjs`、`scripts/platforms/mac.mjs`，平台打包目标和安装集成都由对应模块提供；`package.json` 保留公共构建配置。

未来接入平台时，在登记表添加模块加载函数，并实现三个导出：`packOptions`（传给 electron-builder 的平台构建选项）、`install({ root, home, source })`、`uninstall({ root, home, source })`。`root` 是仓库目录，`home` 是当前用户目录，`source` 是可选的解包产物目录；省略 `source` 时由平台模块确定默认产物位置。平台的依赖检查、安装路径、启动器、文件关联、图标注册与卸载逻辑放在自己的模块中。

| 位置 | 当前平台依赖 | 后续接入范围 |
| --- | --- | --- |
| `scripts/platforms/kde.mjs`、`assets/emd.desktop` | Linux 解包目录和可执行文件；XDG 数据/日志目录、`~/.local/bin`、`/bin/sh`、`setsid`、desktop/MIME 与 hicolor 图标；`desktop-file-validate`、`update-desktop-database`、KDE Plasma 6 的 `kbuildsycoca6` | GNOME 集成验证；Windows 安装与卸载模块 |
| `scripts/platforms/mac.mjs` | 当前架构的 `.app` / DMG / ZIP、用户级 Applications、nohup 启动器、Finder 注册和卸载 | Developer ID 签名与公证 |
| `scripts/render-icons.mjs` | 各平台通过 resvg 生成 PNG；Mac ICNS 由 builder 生成 | Windows ICO；继续以 `assets/emd.svg` 为唯一设计源 |
| `electron/platforms/*.cjs` | Linux 桌面身份、macOS 菜单/Finder/Dock、三平台键位；由 `index.cjs` 集中选择 | 新增有实际差异的平台能力 |
| `electron/commands.cjs`、`electron/main.cjs` | 语义命令生成键盘匹配、菜单 accelerator 与 UI 提示，主进程统一分派 | 后续命令使用相同定义与分派入口 |
| `electron/files.cjs`、`src/components/Workspace.tsx` | 主进程用 Node 路径语义返回工作区根目录与活动祖先，渲染层使用路径标识 | 保留 POSIX、Windows 盘符和 UNC 路径契约 |
| `electron/files.cjs`、本地资源协议 | 使用 Node 的 `path`、`fs`、文件 URL；原始字节保存和 inode 覆盖保护 | 各系统的文件系统语义、符号链接、本地资源 URL 验证 |
| `tests/reader.spec.cjs`、`tests/mac-platform.test.mjs` | Linux 条件执行 X11 / xprop；macOS 验证菜单、Finder 文件打开、Cmd 快捷键和隔离安装 | GNOME/Wayland、Windows 原生窗口和安装验证 |

GNOME 和 Windows 的打包安装入口仍待接入。GitHub Actions 在 Linux x64、macOS arm64/x64、Windows x64 原生运行机验证共享构建、文件、命令和 Electron UI；Linux/macOS 另验证当前打包安装能力。CI 报告与支持平台的档案保留 7 天。

## 开发与验证

```sh
npm start
npm test
```

`npm test` 进行类型检查、生产构建、原始字节保存与覆盖保护、工作区扫描、平台入口、隔离安装与卸载测试，以及真实 Electron 无边框窗口测试：HTML 内嵌 JS/CSS、隔离、查找与重读，公式、代码、图表、相对图片、多标签、另存为、重新读取、重复启动、HTML 清理、工作区文件切换及右键菜单、面板拖拽与窄窗口布局。需要运行图形会话；Linux 还需要 `xprop` 检查原生图标，无头 Linux 可用 `xvfb-run -a npm test`。KDE 安装测试仅在 Linux 执行，macOS 安装测试使用隔离目录；临时文件使用系统临时目录，截图、进程日志和追踪保存到 test-results。

主进程负责文件与原生菜单，沙箱化渲染进程只通过限定的 IPC 接口操作已打开的文件。Markdown 中的 HTML 经 DOMPurify 清理，Markdown 文档脚本不会执行。独立 HTML 文件通过专用协议加载原始文件快照。HTML 的内容安全策略允许内嵌脚本与样式，iframe 沙箱隔离应用权限。应用自身的脚本策略保持不变。

## 排版来源

渲染器与主题来源[yceachan.github.io](https://github.com/yceachan/yceachan.github.io)

- `src/markdown.css`：原 `src/index.css` 的阅读色彩、frontmatter 和 `.vp-doc` 样式。
- `src/lib/markdown.ts`、`shiki.ts`、`slugify.ts`：原渲染链；针对桌面阅读补充 HTML 清理、属性转义和 BOM/CRLF 处理。
- `src/components/Article.tsx`：沿用原 Mermaid、图片缩放的呈现方式，加入本地图片协议和明确的错误提示。

## 开源许可

MIT [LICENSE](LICENSE)。

应用图标以 `assets/emd.svg` 为唯一设计源：暖陶色底板、展开的书页与 Markdown 符号。`npm run build:icons` 生成窗口用 PNG 和 16–512px 的桌面图标；安装时图标名称与应用 ID 一致，并给 desktop 入口写入明确的 PNG 路径。
