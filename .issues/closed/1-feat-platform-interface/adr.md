# ADR-001：应用命令与实际平台差异

状态：已实施，Linux 开发基线交付。需求以 [issue.md](issue.md) 为准。

`electron/platforms/index.cjs` 是运行时平台选择入口。各端口提供 `keyboard`、`install(context)` 、`createMenu(context)` 与 `createFullscreenToggle(window)`：Linux 设置桌面身份，macOS 绑定 Finder/Dock 事件并创建原生菜单，Windows 使用共同生命周期且不新增无差异包装。构建安装仍使用现有 `scripts/platforms/*.mjs` 的 `packOptions/install/uninstall`。

`electron/commands.cjs` 定义语义标识、标签、修饰键与启用条件。平台将 Primary 映射为 macOS Command 或 Linux/Windows Control，全屏分别为 Ctrl+Cmd+F 与 F11。Ctrl+Tab 及 Ctrl+Shift+Tab 切换标签，Alt/Option+F 打开文件菜单。映射同时生成 Electron accelerator、键盘匹配规则与 UI 提示。

主进程统一分派命令。`before-input-event` 消费应用绑定时阻止原生菜单 accelerator 的重复执行；复制、粘贴、选择等普通编辑行为保留原生处理。渲染层通过 `command` 调用语义动作，通过 `activeDocument` 报告活动文档，以同一启用条件更新菜单与按钮。

工作区根目录、后代与活动祖先由 `electron/files.cjs` 使用 Node `path.relative/dirname` 计算。主进程校验根目录授权，渲染层将路径当作标识并使用 `activeAncestors` 展开目录，避免路径分隔符假设。文件读写仍由已有受限 IPC 处理。

HTML 使用独立文档协议和沙箱 iframe，不能取得应用 preload。原始字节另存为、源文件及硬链接保护、安装归属与符号链接检查、失败恢复继续保留。图标统一使用 resvg，消除构建脚本中的系统引擎分支。

后续命令接入此定义与分派点；启动布局、编辑器和 Android 的具体接口由各自 issue 决定。本决策不预建配置框架或插件容器。

Windows 透明窗口在 Electron 44 中用边界模拟全屏，但 `isFullScreen()` 未更新。Windows 端口按 enter/leave-full-screen 事件保存状态，切换仍调用原有 `setFullScreen`；Linux/macOS 使用共同 API。监听只在创建窗口后安装一次。窗口外观与快捷键保持一致。
