# Issue 1 Linux 开发基线审查

审查对象：`fe826e9b708e354001aa2ff7b0a6632400e17614`。依据当前源码及已有平台审查记录做静态检查；本轮未运行测试，也未改动源码。

## 结论

未发现阻止 Linux 继续开发或阻止 F12、桌面设置、外部编辑器沿现有 Electron 主进程入口增量接入的 P1/P2。命令元数据由 `electron/commands.cjs` 单点生成 accelerator、输入匹配和快捷键提示；Linux/macOS/Windows 分别提供 keyboard mapping，主进程统一消费匹配输入并分派。原生菜单通过同一 `commandItem` 入口使用命令。`ReaderCommand` 的 TypeScript union 单独列出命令 ID，renderer 与主进程也各有行为分派点；新增命令需要同步这些调用点，但快捷键和标签等运行时配置没有平行副本。新功能仍需在适当的主进程或 renderer handler 中增加行为，这是当前职责划分，不构成接入障碍。

运行时平台选择集中在 `electron/platforms/index.cjs`。Linux 端口提供键位、桌面身份、空原生菜单和共享全屏 toggle；主进程仅在建窗后调用平台安装、全屏 toggle 和菜单工厂。应用源码没有散落的 OS 分支。打包/安装另有 `scripts/platforms.mjs` 入口：当前 KDE adapter 已实现，GNOME 与 Windows 明确以 TODO 失败；这限制相应平台的打包安装，不限制 Linux Electron 开发或运行时功能增量。

工作区树由主进程扫描；渲染层把文档路径当作标识传回 IPC，不拆分或规范化路径。主进程在每个 workspace 请求上验证 sender 和应用 frame，在打开文件前解析 `realpath` 并检查授权根包含关系。Node `path` 与文件权限逻辑留在 Electron 主进程，因此 Linux 现有路径处理没有对 KDE shell 命令或 `/` 字符串处理的运行时依赖。

## Android 扩展边界

Android 不能直接作为当前 Electron runtime port 加入：`selectPlatform` 只接受 Electron 的 Linux、macOS、Windows 平台，renderer 也直接依赖 preload 提供的 `window.emd` IPC 对象及路径型工作区调用。现有 Android ADR 已将 Capacitor/native plugin 与独立应用能力接口列为后续路线，并要求单独处理文档 URI 与授权。这是明确的后续 runtime/capability 接入工作，不是 Linux 基线缺陷；当前 issue 1 不应据此宣称已提供 Android runtime adapter。

F12、设置、桌面编辑器与 Android 功能的具体行为仍由各自 issue 决定。本审查只确认共享桌面命令、平台端口和主进程文件权限入口没有引入新的 P1/P2 或隐式平台分支。
