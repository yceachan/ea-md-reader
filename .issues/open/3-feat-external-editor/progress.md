# 当前交接状态

2026-10-07：按用户确认的首版范围接入设置、文件树中键、文件与标签菜单、临时打开方式及自动快照更新。保存、支持等待的会话结束与焦点重查共用更新来源，不改变活动标签，不复活已关闭标签。Markdown 保留阅读位置并重算进度，HTML 更新预览版本。

编辑器原型保留在分支 `codex/probe-editor`，probe 工作树已清理。Node 检查 35 项通过，2 项原生 macOS 检查跳过；Electron UI 10 项通过，1 项原生 macOS 检查跳过。阅读位置改动后的受影响用例和 Linux 打包版检查也已通过。macOS/Windows 实机编辑器仍待原生验证。证据见 [/home/pi/.codex/artifacts/ea-md-reader/desktop-development-20261007/artifacts/](/home/pi/.codex/artifacts/ea-md-reader/desktop-development-20261007/artifacts/)。需求与验收以 [issue.md](issue.md) 为准。
