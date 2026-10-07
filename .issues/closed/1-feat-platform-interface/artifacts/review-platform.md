# Issue 1 平台接口独立审查

审查对象：`7cebdef..086b3f072beced506c7d82b43043a32776ef41f1`（HEAD `086b3f072beced506c7d82b43043a32776ef41f1`）。本记录只审查 issue 1 的组合实现；源码未改动，未运行测试或完整回归。`git diff --check 7cebdef 086b3f0` 无输出。

## 结论

未发现有具体触发和证据的 P1/P2。下列审查面没有阻止合入的源码问题：

- **平台接口。** `electron/platforms/index.cjs` 集中选择运行时端口。Linux 的桌面身份、macOS 的 Finder/Dock 事件与原生菜单、各平台键位映射分别由平台模块提供；Windows 没有被加上无差异系统调用包装。通用 Electron 与 Node 行为仍由 `main.cjs`、`files.cjs` 共享。构建脚本中的图标渲染统一使用 resvg。
- **语义命令。** `electron/commands.cjs` 保存命令标识、语义修饰键和平台绑定，并生成 accelerator、输入匹配和 UI 提示。主进程统一分派；匹配输入调用 `preventDefault()` 后只分派一次。Electron [webContents 文档](https://www.electronjs.org/docs/latest/api/web-contents/#event-before-input-event)明确该调用也会阻止菜单快捷键，因此与 macOS 原生 accelerator 不形成双重执行。复制、粘贴、全选等编辑键未被命令匹配接管。命令映射和原生菜单契约有对应测试。
- **macOS 原生菜单。** 菜单由 macOS 端口生成，菜单项使用同一命令集；关闭标签、退出、缩放和全屏使用应用命令，编辑菜单保留系统编辑角色。Linux/Windows 端口返回无应用菜单，符合当前自绘窗口行为。
- **Windows 路径、共享文件与 UI。** 渲染层不拆分路径或猜测分隔符；主进程用 Node `path` 计算根目录、祖先及包含关系。命令、文件和 Electron UI 测试进入 Windows 工作流；POSIX/macOS 夹具在 Windows 明确跳过，且存在 Windows 风格盘符、UNC 路径单测。
- **HTML、原始字节与工作区权限。** HTML 仍由独立 `emd-page` 协议和仅允许脚本的 sandbox iframe 加载，内容保持在独立 origin，不注入 preload；另存为使用打开时捕获的原始字节，并保留自身/硬链接覆盖保护。工作区打开先解析真实路径，再检查其位于主进程授权根内；上下文菜单也检查根内路径。UI 只把路径当标识。

## 完成门槛

源码中的四平台矩阵、报告/追踪/截图归档及 Windows/GNOME 安装 TODO 显式失败检查均已配置。但**最终提交的四个平台 CI 成功记录仍待集成出口完成并归档**；因此 A1.4 和 A1.6 暂不能仅凭本源码审查标为完成。此结论与当前静态配置审查分开，最终需绑定实际 CI run 与提交。

本审查不重做已完成的 macOS PR 安装器审查。旧 PR 的审查及原生安装验证证据见本 issue 的其他 artifact。

## Windows 全屏故障与最小修复审查（追加）

复核来源：Windows CI run [37532844526](https://github.com/yceachan/ea-md-reader/actions/runs/37532844526) 中 build、Node 与 4 个 Electron UI 用例通过，F11 用例等待 `isFullScreen()` 返回 `true` 超时。trace 显示窗口尺寸由 `1024x720` 变为 `1024x768`，即窗口已铺满该显示器，但 Electron 状态 API 仍返回 `false`。

原因与应用窗口配置吻合：`electron/main.cjs` 创建 `transparent: true` 的无边框窗口。Electron v44.5.1 在 Windows 构造时将透明窗口的 `thick_frame_` 设为 false；`NativeWindowViews::SetFullScreen()` 对此分支先发 `enter-full-screen` / `leave-full-screen` 通知，再通过显示器 bounds 和保存的 `restore_bounds_` 改尺寸并提前返回。此分支不调用 widget 的 fullscreen 状态；`IsFullscreen()` 仍直接读取 `widget()->IsFullscreen()`，所以 `isFullScreen()` 不能用来反向切换。对应 [Electron v44.5.1 源码 206–209、759–829 行](https://github.com/electron/electron/blob/v44.5.1/shell/browser/native_window_views.cc#L206-L209)。`BaseWindow` 将 native enter/leave 通知作为同名事件同步发出，[源码 281–288 行](https://github.com/electron/electron/blob/v44.5.1/shell/browser/api/electron_api_base_window.cc#L281-L288)；官方 [BrowserWindow 文档](https://www.electronjs.org/docs/latest/api/browser-window#event-enter-full-screen)也列出这两个事件，并提醒全屏状态查询应等待事件。

建议的最小 seam 合理：Windows 端口在 BrowserWindow 创建后安装一次全屏事件监听，维护显式布尔状态，并返回 Windows 专属 `toggleFullscreen` 闭包；`main.cjs` 保留现有公共 `window.setFullScreen(!window.isFullScreen())` 作为 macOS/Linux 路径，只在 Windows 调用端口提供的闭包。这样把真实差异放到平台实现，不改命令 ID、键位配置或共享窗口 API。

状态风险可控，但事件处理必须将 `enter-full-screen` 写成 `state = true`、`leave-full-screen` 写成 `state = false`，不能按事件取反。Electron 该 Windows 分支会在每次 `SetFullScreen()` 请求时发送通知；重复请求同一状态可能重复发出 enter/leave。当前窗口创建时没有请求初始全屏，且所有应用全屏调用都走该命令，因此初始 `false` 与事件同步覆盖现有调用路径。若以后新增启动即全屏或绕开端口直接调用，应同步扩展这个状态的不变量。

Windows 回归应继续通过真实 F11 输入触发命令，记录调用前的窗口 bounds，并用窗口位置对应显示器的实际 `.bounds` 验证进入后铺满显示器；随后经同一个 `window.emd.command('toggleFullscreen')` IPC 退出，等待并断言 bounds 恢复原值。此断言直接覆盖几何效果和 `restore_bounds_`，不要再用已知不可靠的 `isFullScreen()` 作为 Windows 预期。其他平台保留原生 `isFullScreen()` 断言。以上是修复与验收建议；本轮仍未改源码或运行测试。
