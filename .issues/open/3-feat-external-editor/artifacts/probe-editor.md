# 3.0 编辑会话探测

Linux 上 VS Code 的 `--wait` 能等待本次文件关闭。已有编辑器进程复用时也成立。普通 `code` 启动器退出不能表示编辑结束。此结论来自真实编辑器执行，不来自等待进程的模拟夹具。macOS 与 Windows 尚未执行，3.0 的跨平台门槛仍未完成。R3.4 的 Reader 自动重读功能仍未实现。

本记录只维护会话探测证据。需求与验收以 [raw issue](raw-issue.md) 为来源，方案以 [ADR-003](adr.md) 为来源。探测代码位于独立 worktree 的 `probes/editor/`，不修改 App、设置或 IPC。本地提交是 `a1575a5`，分支为 `codex/probe-editor`，没有 push。数据记录程序参数、启动器退出、编辑器标签、保存事件、扩展宿主 PID 和父进程 PID。

2026-10-06 在 Fedora Linux 44 x64、Node.js `v22.23.1` 上执行。已安装编辑器为 `/usr/bin/code`，版本 `1.139.0`，构建 `2242ebbb54efeeb0129e08e919e7e8d43033cd83`，架构 x64。`kate` 不在 PATH。本轮没有安装系统软件。图形会话使用临时解包的 Xvfb `/tmp/emd-layout-xvfb/usr/bin/Xvfb`，显示号 `:93`，没有窗口管理器。

探测为每个新编辑器实例创建独立 `--user-data-dir`，并使用临时 `--extensions-dir`。普通 VS Code 扩展只安装在该临时目录。扩展调用真实的标签关闭 API、文本编辑与保存 API，以及关闭窗口命令。它不模拟 CLI 退出。主脚本用 `spawn` 的参数数组启动程序，`shell` 为 `false`。本轮没有打开、修改或关闭用户现有 VS Code 项目与窗口。

普通启动检查先在新 profile 中打开 Markdown。启动器退出码为 0 后，扩展仍报告该文件标签，并能响应检查请求。这直接复现 B3.1：普通启动器结束与编辑结束是两个不同事件。

已有进程检查使用同一 profile 的 `--reuse-window --wait` 打开 HTML 文件。旧 Markdown 标签继续存在。两次打开的扩展宿主 PID、父进程 PID 和 sessionId 相同。保存操作完成并且文件字节改变后，等待启动器继续运行。关闭 HTML 标签后，等待启动器退出码为 0。同一扩展宿主继续响应，旧 Markdown 标签仍存在。因此，该等待对象是本次文件，不是整个编辑器应用寿命。

已有窗口的第二次检查同样使用 `--reuse-window --wait`，这次保持目标文件打开并关闭窗口。等待启动器退出码为 0。未编辑的文件字节与初始内容相同。新进程检查使用另一个全新 profile，确认宿主和父进程 PID 不同。关闭本次文件后，等待启动器退出码为 0，空窗口也自动关闭。另一个全新 profile 的检查直接关闭窗口，等待启动器同样退出码为 0。五个场景全部通过。

参数检查使用文件名中的中文、空格、单引号、双引号、`$()`、`&`、`;`、反引号和 `%`。编辑器标签 API 返回的规范路径必须与传入的完整路径相等。保存操作只修改指定 HTML 文件。其他未编辑文件必须保留原字节。此结果覆盖 Linux 上 A3.4 的启动参数边界。它不证明 Reader 的文件权限校验或设置功能。

可复跑入口是 `probes/editor/run.mjs`，观察扩展是 `probes/editor/extension/`。当前原始数据在 `probes/editor/results/linux-x64/result.json`、`driver.jsonl` 和 `editor.jsonl`。`result.json` 记录五个场景与每次启动器状态。`driver.jsonl` 记录操作与退出的时间顺序。`editor.jsonl` 记录真实编辑器的标签、保存与确认事件。失败时脚本返回非零状态，并保留错误和探测目录。成功时脚本清理临时 profile 与文件。运行命令如下。

```sh
DISPLAY=:93 node probes/editor/run.mjs --editor /usr/bin/code
```

同一脚本可以进入后续 macOS CI。先安装已固定版本的 VS Code，确认实际 CLI 路径，再执行。下面路径对应常规 `.app` 安装位置。本机没有 macOS，下面命令尚未执行。它验证 VS Code 包内 CLI，不能作为 `/usr/bin/open -a` 的文件级等待证据。

```sh
node probes/editor/run.mjs --editor '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' --output probes/editor/results/darwin-native
```

Windows CI 使用 `Code.exe` 和随安装提供的 `resources/app/out/cli.js`。脚本为该执行方式设置 `ELECTRON_RUN_AS_NODE=1`，继续使用无 shell 的参数数组，避免以 `code.cmd` 批处理作为无 shell 可执行程序。实际安装目录必须先确认。本机没有 Windows，下面命令和此启动分支尚未执行。Windows 文件系统禁止双引号等字符，脚本用其允许的中文、空格、单引号和 shell 字符组合。

```powershell
node probes/editor/run.mjs --editor 'C:\Program Files\Microsoft VS Code\Code.exe' --cli-script 'C:\Program Files\Microsoft VS Code\resources\app\out\cli.js' --output probes/editor/results/win32-x64
```

上述结果支持将 Linux 的 VS Code CLI `--wait` 作为首个有证据的文件会话等待方式。未验证的编辑器与系统应用分发方式只能报告启动结果，不能声明可等待文件关闭。macOS arm64、macOS x64、Windows、Kate 和 macOS `.app` 系统分发仍缺少原生结果。保存时原子替换、连续保存、目录监听、Reader 焦点恢复和全部标签更新属于后续 3.4，本探测没有执行这些业务行为。

[VS Code 官方 CLI 文档](https://code.visualstudio.com/docs/configure/command-line)定义 `--wait` 为等待文件关闭，定义 `--reuse-window` 为复用最近窗口，并说明独立用户目录可以隔离实例。本轮实际验证了这些含义。[VS Code API 文档](https://code.visualstudio.com/api/references/vscode-api)说明文档释放事件不保证对应标签关闭。因此，探测使用标签 API 观察与关闭目标文件，未把文档释放事件当作通用关闭证据。
