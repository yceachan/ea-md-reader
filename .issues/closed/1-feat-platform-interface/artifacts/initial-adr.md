# ADR-001：应用定义能力，平台实现系统差异

状态：拟定，未实施。日期：2026-10-06。需求、代码证据与验收以 [raw issue](raw-issue.md) 为唯一来源。本文维护平台边界和命令配置决策。

## 决策

应用层定义需要的能力和语义命令。平台端口是应用使用的能力接口。平台实现负责系统差异。接口从现有调用提取，不先建立通用插件框架或服务容器。

构建与安装继续使用 `packOptions`、`install(context)`、`uninstall(context)`。运行时与安装的生命周期不同，运行时接口不依赖安装模块。KDE 是 Linux 的桌面集成实现，macOS 是操作系统实现，不将它们强行改成同一级系统名。

主进程集中选择运行时平台实现。渲染层只接收命令展示信息、文档和工作区数据。它不读取 `process.platform`，不组装系统命令，也不判断路径分隔符。

## 责任分配

下表定义最小职责。名称为拟定契约，不是本轮新增文件。实际模块拆分按现有工程规模完成。

| 边界 | 应用定义 | 平台或通用实现 |
| --- | --- | --- |
| 命令配置 | 命令标识、语义修饰键、启用条件、执行动作 | 平台键位、Electron accelerator、UI 显示文本 |
| 桌面集成 | 设置应用身份、建立菜单、绑定系统打开和激活事件 | Linux desktop 名称，macOS 原生菜单、Finder、Dock，Windows 必要差异 |
| 窗口行为 | 最小化、恢复、关闭、全屏等应用动作 | 真实存在的平台差异。共同 BrowserWindow 调用继续共用 |
| 文件与工作区 | 读文档、判定工作区关系、返回树节点 | Node 的 `path`、`fs` 与 URL API。只为实际差异增加平台实现 |
| 构建与安装 | 打包、安装、卸载三个现有入口 | 当前平台适配器，保留各系统的保护与恢复 |
| 外部编辑器 | 打开指定文档、报告启动结果与会话完成能力 | 接口细节由 [ADR-003](../3-配置外部编辑器并自动重读/adr.md) 单独维护 |

Electron 已经统一的调用不再增加一层同名包装。Markdown 渲染、标签状态、文件读取与 HTML 隔离规则属于应用行为。它们继续共享。平台模块只接收它需要的上下文，不取得无限制的内部状态。

工作区的根目录选择、后代关系和活动祖先信息由主进程计算。主进程继续用规范路径做权限检查。渲染层按节点数据展开文件夹，并把路径当成标识。它不通过字符串替换把 Windows 路径伪装成 POSIX 路径。

## 命令配置

语义修饰键 `Primary` 表示本平台的应用主要修饰键。macOS 将它映射成 Command，Linux 和 Windows 将它映射成 Control。Electron 的 `CommandOrControl` 提供同样的 accelerator 映射，可用于原生菜单。[Electron 官方快捷键说明](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#cross-platform-modifiers)支持这一映射。

应用配置同时生成键盘匹配条件、原生菜单快捷键和渲染层提示。渲染层不保留第二份 Ctrl 文本。新增配置不等于新增用户自定义快捷键功能。

| 语义命令 | 语义绑定 | macOS | Linux / Windows |
| --- | --- | --- | --- |
| `openDocument` | Primary+O | Cmd+O | Ctrl+O |
| `saveAs` | Primary+Shift+S | Cmd+Shift+S | Ctrl+Shift+S |
| `closeTab` | Primary+W | Cmd+W | Ctrl+W |
| `reloadDocument` | Primary+R | Cmd+R | Ctrl+R |
| `findInDocument` | Primary+F | Cmd+F | Ctrl+F |
| `nextTab` / `previousTab` | Control+Tab / Control+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab |
| `quit` | Primary+Q | Cmd+Q | Ctrl+Q |
| `zoomIn` / `zoomOut` / `zoomReset` | Primary+Plus / Minus / 0 | Cmd++ / Cmd+- / Cmd+0 | Ctrl++ / Ctrl+- / Ctrl+0 |
| `toggleFullscreen` | 平台映射 | Ctrl+Cmd+F | F11 |
| `toggleFileMenu` | Alt+F | Option+F | Alt+F |

后续新增命令继续使用这一个配置来源。开发者控制台的 F12 绑定与菜单行为由 [ADR-006](../6-F12与文件菜单开发者控制台/adr.md)维护，实施时加入同一分派点。启动布局能力由 [ADR-004](../4-可配置启动布局与窄屏面板覆盖层/adr.md)维护，Android 文档端口扩展由 [ADR-005](../5-Android工具链与适配方案/adr.md)维护。

该表是默认映射提案。macOS 标签切换使用 Ctrl+Tab，避开系统的 Cmd+Tab。加号匹配主键盘与数字键盘的真实输入，不能把所有 Shift 组合都误判成另存为或打开。修改默认绑定时只修改这一配置来源，并更新对应行为测试。

主进程的一个命令分派点处理键盘和菜单动作。原生菜单 accelerator 与 `before-input-event` 必须共用消费规则，防止重复调用。查找输入框保留输入、复制、粘贴和选择行为。应用专用命令优先按明确绑定匹配，不接管系统全局快捷键。

## CI 决策

CI 在每个系统的原生运行机执行。Linux 模拟 macOS 参数不能证明 Finder、签名、安装和窗口焦点行为。macOS arm64 和 Intel 都进入验证范围。

共享行为在所有目标系统执行。平台安装测试只在对应系统执行。没有实现 Windows 或 GNOME 安装器时，验证其入口明确失败，不能把失败吞掉后标为安装成功。

合入 PR #1 与完整平台重组分别交付。PR 合入前完成相关审查和原生验证。随后重组已验证的行为。CI 作业划分、运行机标签和执行顺序由 [route](route.md) 维护。

## 取舍与约束

继续在主进程和 UI 分散增加平台分支会扩大 F1.2、F1.3、F1.4 的问题，所以采用上述边界。把每次 `fs` 或 BrowserWindow 调用都做成平台插件会增加无差异的接口，所以只分离真实系统依赖。

不提前实现 Windows 安装器、GNOME 安装器或签名发布服务。保持关闭最后窗口即退出的现行策略。保留 PR 的安装保护和已有的只读、文件权限与 HTML 隔离边界。

本决策完成的证据由 raw issue 的 A1.2、A1.3、A1.4 定义。若原生测试发现映射冲突，在本文记录新证据和替代映射，再修改实现。
