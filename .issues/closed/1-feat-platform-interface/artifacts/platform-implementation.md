# 1.4 平台边界与语义命令实施记录

本地实现提交为 `dce7641`，分支为 `codex/platform-commands`。构建、29 项 Node 检查、2 项命令 UI 检查和 3 项既有 Reader UI 回归通过。源码已经集中平台选择、语义命令、真实键位、提示和工作区关系。本次没有 push 或合入。macOS 与 Windows 的新代码仍缺少原生 CI 结果，因此 A1.2、A1.3 的跨平台验收尚未闭环。

需求和验收以 [raw issue](raw-issue.md) 为来源，职责边界以 [ADR-001](adr.md) 为来源。本记录维护本次实施的源码、验证与限制。实现基线是组合提交 `4d89533`，该来源已包含固定的 HTML 功能与最终 macOS PR 行为。实现提交的父提交是主任务提供的 `9a1917a`，它维护 CI 和 Windows 测试范围。本记录不把原 PR 的检查结果当作新平台重组的结果，也不假定原 PR 已合入主线。

`electron/platforms/index.cjs` 是运行时的唯一平台选择入口。主进程调用端口的 `install` 和 `createMenu`。Linux 端口负责 desktop 身份。macOS 端口负责 Finder 文件打开、Dock 激活和 App/File/Edit/View/Window 菜单。Windows 沿用当前 Electron 共有生命周期和窗口操作，并选择 Control 键位。BrowserWindow 恢复、显示、聚焦、最小化和最大化继续使用共有实现，没有增加同名包装层。运行时端口不导入打包或安装模块。

`electron/commands.cjs` 定义 13 个应用命令、语义修饰键与需要文档的启用条件。平台端口提供 Primary 的真实输入键、accelerator 和显示文字。macOS 使用 Command，Linux 与 Windows 使用 Control。Ctrl+Tab 和 Ctrl+Shift+Tab 在各端固定。macOS 全屏使用 Ctrl+Cmd+F，其余桌面端使用 F11。Alt+F、缩放加号、减号和归零也来自该配置。macOS 将 Alt 的提示显示为 Option。渲染层没有第二份 Ctrl 或 Command 提示。

键盘、原生菜单和应用按钮先进入主进程的 `dispatchCommand`。菜单项使用同一配置生成 accelerator。`before-input-event` 只匹配明确的修饰键组合，并在分派前调用 `preventDefault`。Electron 会同时阻止页面键盘事件和菜单 accelerator，从而避免同一按键重复触发。Shift+O、Shift+W、额外 Alt 或另一个主要修饰键不冒充打开或关闭命令。加号只对缩放命令接受主键盘所需的 Shift 差异。查找输入框的复制、粘贴与全选继续进入原生处理。[Electron 官方事件说明](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event)定义了上述消费规则。

preload 提供受限的 `command(id, documentId?)`。主进程验证命令 id 与文档 id。`ready()` 返回配置生成的 `CommandHints`，`activeDocument(id|null)` 返回同一启用条件计算的 `CommandAvailability`。原生菜单和应用按钮共用这些条件。渲染层接收 `{ id, documentId }`，处理标签、查找和提示状态。原有保存、关闭与重读 IPC 继续作为受验证的文档服务，保留原始字节与 HTML 预览版本语义。

`electron/files.cjs` 的 `workspaceContext` 使用 Node 的路径 API 选择根目录与活动祖先。主进程只接受已登记的旧根目录，保留有效根目录，在文档移到工作区之外时选择新的父目录。工作区结果新增 `activeAncestors`。App 与 Workspace 只比较路径标识和祖先列表，不拆分分隔符。活动标签切换时保留已有树，直到新的关系返回，因此文件夹展开状态继续有效。Node 检查覆盖 POSIX、Windows 盘符、UNC、同名前缀目录和不同盘符。Windows 纯路径检查没有代替原生文件系统检查。

HTML 的独立协议、CSP、iframe 沙箱、导航校验和 IPC 调用来源校验没有修改。UTF-8 严格读取、原始 bytes、硬链接覆盖保护、HTML `pageUrl` 版本与工作区规范路径授权继续保留。关闭最后窗口即退出的共有监听保留。macOS 的窗口恢复沿用原有共有函数。没有增加 F12、外部编辑器、设置、布局重排或 Android 实现。

本地环境为 Fedora Linux x64，Node.js `v22.23.1`，Electron `44.5.1`。`npm ci` 与 `npm run build` 成功，类型检查包含在 build 中。`npm run test:node` 得到 29 项通过、2 项 macOS 原生恢复用例跳过。新增的 10 项 Node 检查覆盖三个平台的键位、严格修饰键、输入消费、菜单契约、平台生命周期和路径关系。跨系统参数检查只证明配置和接口协议。

`DISPLAY=:94 npx playwright test tests/commands.spec.cjs` 得到 2 项通过。该独立 Xvfb 会话检查真实 Electron 输入、单次打开请求、按钮分派、Ctrl+Tab、查找重复聚焦、复制粘贴、主键盘与小键盘缩放、Alt+F、全屏、关闭标签和工作区祖先。小键盘输入使用 Electron 官方支持的 `numadd` / `numsub` 键码。加号事件实际返回 `key: '+'`、`code: 'NumpadAdd'`。这是 Electron 输入注入的原生运行证据，不是物理键盘操作记录。macOS 分支另外检查原生菜单点击和 accelerator 的单次消费，但本机没有执行该分支。

`DISPLAY=:0 npx playwright test tests/reader.spec.cjs` 在有窗口管理器的现有图形会话中得到 3 项通过、1 项 macOS 原生用例跳过。通过范围包含 HTML 交互和隔离、原始字节另存为、Markdown 渲染、单实例、工作区切换、右键菜单、展开状态、窗口最大化、面板拖拽与窄窗口布局。无窗口管理器的 Xvfb 无法证明最大化行为，该检查没有被跳过，改在真实桌面会话执行。探测专用 Xvfb 在交付前关闭。

新增测试为 `tests/commands.test.cjs`、`tests/runtime-platforms.test.cjs` 与 `tests/commands.spec.cjs`。`tests/reader.spec.cjs` 仅调整 macOS 菜单角色检查，以适应新 File/View 菜单。CI、package 测试入口、Playwright 配置和其他跨平台夹具由主任务维护，本实现提交没有修改这些文件。下一步需要在最终组合提交上运行 macOS arm64、macOS x64 和 Windows x64 的原生检查，再记录实际运行链接。原 PR 的合入仍由主任务处理 GitHub 权限 checkpoint。
