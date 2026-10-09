# Linux DevTools 基线复查

本轮保留 `ed28124` 的 Reader 自建 DevTools 窗口实现，Electron 仍锁定为 44.5.1。没有迁移到 Electron 默认窗口，也没有改变 DevTools 的关闭或重开逻辑。

PR 以 `yceachan/win-dev` 为目标分支，只补充测试诊断，供定位 Linux 用例失败。

## 运行

在 Linux 检出 PR 分支 `codex/devtools-linux-diagnostics`。按 README 准备构建依赖及 Xvfb、Openbox、xprop，随后执行：

```sh
npm ci
npm run build
npm run test:ui -- commands.spec.cjs --grep 'F12 与文件菜单' --reporter=line,html
```

`test:ui` 会使用独立 Xvfb 显示和 Openbox，不操作当前桌面。该用例已有五次最小化恢复、关闭与重开检查，并验证正文尺寸和 Reader 正常退出。需要复查偶发失败时，可在同一命令后增加 `--repeat-each=3`，保持有界重复。

## 保留现场

查看失败用例在 `test-results/reader/` 下的输出，以及 `playwright-report/`：

- `electron-process.log`：stdout/stderr、测试启动进程退出码与信号、Electron 主进程 PID 和版本、渲染进程及其他子进程异常退出信息。
- `electron-cleanup.log` 和诊断附件：原始测试错误、trace 停止错误及应用关闭错误分别记录。
- `electron-context-trace.zip`、Playwright trace 和错误上下文：能成功保存的执行现场。

已有原始错误时，清理错误仅作为附加诊断；只有清理错误时，测试仍失败。这样可以区分应用提前退出、普通断言失败与单独的 trace 收尾故障。

本地 Windows 已通过类型检查、41 项 Node 测试和 18 项 UI 测试；平台不适用项分别跳过 14 项和 2 项。另已通过独立桌面的真实故障注入验证错误保留和渲染进程退出记录。Linux 结果待复查，本 PR 不宣称修复其 DevTools 生命周期故障。
