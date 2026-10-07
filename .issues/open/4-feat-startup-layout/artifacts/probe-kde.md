# KDE Wayland 原型记录

阶段 4.0 的核心路径在真实 KWin 6.7.5 会话中通过。测试覆盖两块实体屏幕、130% 与 150% 缩放、底部保留区、一次定位和无活动窗口分支。负坐标、拔除屏幕及其他缩放比例仍是原生验证 checkpoint。本文只维护原型证据。布局定义见 [ADR-004](/home/pi/work/ea-md-reader/.issuses/open/4-可配置启动布局与窄屏面板覆盖层/adr.md)。验收定义见 [raw issue](/home/pi/work/ea-md-reader/.issuses/open/4-可配置启动布局与窄屏面板覆盖层/raw-issue.md)。

原型位于独立工作树 `/home/pi/work/ea-md-reader-probe-kde`。分支为 `codex/probe-kde`。本地提交为 `b1bdbd54147262737b6eca94ae12ccf264b53555`，未 push。原型没有导入 Reader 主程序，也没有改写全局 KWin 规则。

## 原生环境与几何结果

`kwin_wayland --version` 返回 `kwin 6.7.5`。会话类型为 `wayland`。测试使用已有 Electron 44.5.1，并显式传入 `--ozone-platform=wayland`。没有安装依赖，也没有修改输出配置。完整命令输出见 [environment.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/environment.json)。

KScreen 报告 eDP-1 为 2560×1600、缩放 1.5，逻辑原点为 `(0,0)`。HDMI-A-1 为 2560×1440、缩放 1.3，逻辑原点为 `(1707,0)`。两块屏幕均连接并启用。本机没有负坐标输出。

KWin 的输出 `geometry` 与 `clientArea` 返回不同精度。eDP 的输出宽度为整数 1707，工作区宽度为 1706.666667。HDMI 的输出宽度为整数 1969，工作区宽度为 1969.230769。原型使用 `clientArea(KWin.MaximizeArea, output, desktop)`，保留小数逻辑坐标。应用没有再次乘设备缩放比。

| 输出 | KWin 工作区 `(x,y,w,h)` | 请求矩形 `(x,y,w,h)` | 实际矩形 `(x,y,w,h)` | 最大差值 |
| --- | --- | --- | --- | --- |
| eDP-1，150% | `(0,0,1706.666667,1021)` | `(1086.666667,0,620,1021)` | `(1086.666667,0,620,1021.333333)` | 0.333333 逻辑像素 |
| HDMI-A-1，130% | `(1707,0,1969.230769,1062)` | `(3056.230769,0,620,1062)` | `(3056.230769,0,620,1062.307692)` | 0.307692 逻辑像素 |

eDP 原生记录见 [dock-edp.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/dock-edp.json)。HDMI 原生记录见 [dock-hdmi.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/dock-hdmi.json)。KWin 在写入后的 1000 毫秒返回实际窗口矩形。两次宽度均为 620 逻辑像素，误差均小于验收允许的 1 逻辑像素。工作区高度小于完整输出高度，证明读取结果排除了当前底部保留区。测试没有移动任务栏，因此只证明当前任务栏位置。

## 活动窗口、身份与一次请求

测试只移动和激活带专用身份的临时 anchor 窗口。anchor 是用于设置测试焦点的窗口。脚本先记录原活动窗口，再把自己的 anchor 放到目标输出。脚本在主窗口创建前读取 `workspace.activeWindow.output`。

eDP 实测时，`activeWindow.output` 为 `eDP-1`，`workspace.activeScreen` 为 `HDMI-A-1`。原型仍选择 eDP。这直接区分了活动窗口所在屏幕与 KWin 活动屏幕。HDMI 的独立测试也按其活动窗口输出完成定位。

无活动窗口测试在真实 KWin 中临时设置 `workspace.activeWindow=null`。脚本随后读取真实 `workspace.activeScreen`，选到 eDP，并完成定位。脚本在同一次同步捕获后立即恢复原焦点。此项证明受控无活动窗口分支，未测试自然闲置桌面的全部焦点策略。证据见 [no-active.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/no-active.json)。

脚本匹配固定 `resourceClass`、本次进程 PID、含随机 token 的主窗口标题，并排除 `dialog` 和 `transient`。token 是只属于本次请求的随机标识。夹具的错误 token 窗口、同进程 `dialog` 角色窗口和后续重复主窗口均保持 700×500。脚本只对首次匹配主窗口写入一次 `frameGeometry`，随后断开 `windowAdded`。同一窗口更改标题并请求 700×500 后，实测尺寸保留，定位计数仍为 1。

身份匹配发现了一个实际限制。当前 Electron 的非模态子窗口以及夹具创建的模态窗口，都能被 KWin 报为 `normal=true`、`dialog=false`、`transient=false`。首次实验把主窗口请求身份错误地复用到子窗口，因此先匹配了子窗口。该结果已明确标为失败原型，见 [rejected-shared-token.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/rejected-shared-token.json)。

后续集成必须确保只有新主窗口携带主窗口请求身份。不能仅依赖 KWin 窗口类型排除所有 Electron 子窗口。主窗口还必须保留请求标题，直到 KWin 回传匹配结果。文件对话框和第二实例不得复用这个 token。当前夹具证明该约束可行，尚未证明 Reader 的真实原生文件对话框和打包后应用身份。

## 脚本生命周期与故障边界

一次性脚本由 `loadScript(path, uniqueName)` 加载。D-Bus 同时公开单参数和双参数重载，因此原型显式使用 `ss` 签名。原型只调用返回 ID 对应的 `/Scripting/Script<ID>.run()`，没有调用会启动其他已启用脚本的 `/Scripting.start()`。结果通过临时 D-Bus 服务回传，接收端只接受当前 KWin 进程的发送者身份。

脚本使用 6000 毫秒的有限期限。期限到达后，脚本断开尚未完成的匹配监听，并卸载自己的唯一脚本名。宿主在 `finally` 中再次读取加载状态，必要时执行卸载。每个正常原生记录的 `loadedAfterCleanup` 均为 `false`，夹具退出码均为 0。最终只读运行也确认没有布局写入、没有焦点变更和没有残留脚本，见 [inspect-final.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/inspect-final.json)。

最终代码再次在 eDP 完成原生定位，实际窗口输出对象与捕获输出对象相等，见 [dock-final.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/dock-final.json)。最后清理检查遍历了证据中的 10 个专用脚本名，均未加载。检查也没有发现夹具主进程，见 [cleanup-final.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/cleanup-final.json)。

调用进程异常退出经过真实验证。只读宿主收到上下文后执行 `os._exit(77)`，跳过 `finally`。独立观察进程在 7 秒后读取 `isScriptLoaded`，返回 `false`。证据见 [caller-crash.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/caller-crash.json)。这证明脚本卸载不依赖调用进程存活。异常退出实验没有创建测试窗口，未把它写成完整桌面应用崩溃测试。

焦点恢复只在当前活动窗口仍属于夹具时执行。eDP 与 HDMI 实测记录了 `focus-restored`。无活动窗口实验结束时，当前焦点已不属于夹具，脚本记录 `focus-untouched`，没有抢回焦点。原型没有移动其他应用窗口。

工作区不足经过原生故障注入验证。请求把最小宽度改为 10000 逻辑像素，KWin 返回 `work-area-too-small`。定位计数为 0，没有 `applied`，普通窗口仍可显示。证据见 [insufficient.json](/home/pi/work/ea-md-reader-probe-kde/probes/kde/evidence/insufficient.json)。这验证真实 KWin 上的失败分支，未声称本机有宽度小于 620 的实体输出。

目标输出移除的分支只经过 API 模型测试。匹配前移除时返回 `target-output-missing`。写入后、回读前移除时返回 `target-output-removed`。模型中两项都没有重定向到另一输出。真实拔屏会影响当前桌面，因此本轮没有执行。

## 可审查原型与复跑命令

[run.py](/home/pi/work/ea-md-reader-probe-kde/probes/kde/run.py)管理临时 D-Bus 服务、Electron 夹具和卸载确认。[layout.js](/home/pi/work/ea-md-reader-probe-kde/probes/kde/layout.js)只处理一次请求与几何回读。[fixture.cjs](/home/pi/work/ea-md-reader-probe-kde/probes/kde/fixture.cjs)创建专用测试窗口。[model.test.cjs](/home/pi/work/ea-md-reader-probe-kde/probes/kde/model.test.cjs)执行 5 个 API 模型用例，全部通过。

以下命令在 `/home/pi/work/ea-md-reader-probe-kde` 执行。原生命令需要当前 KDE Wayland 会话、现有 Electron 可执行文件、Python `dbus` 与 GLib。`--anchor-output` 会短暂激活测试窗口。它只适合允许临时测试焦点的会话。

```sh
cd /home/pi/work/ea-md-reader-probe-kde
node --test probes/kde/model.test.cjs
python3 probes/kde/run.py --mode inspect --output /tmp/emd-kde-inspect.json
python3 probes/kde/run.py --mode dock --anchor-output eDP-1 --electron /home/pi/work/ea-md-reader/node_modules/electron/dist/electron --output /tmp/emd-kde-edp.json
python3 probes/kde/run.py --mode dock --anchor-output HDMI-A-1 --electron /home/pi/work/ea-md-reader/node_modules/electron/dist/electron --output /tmp/emd-kde-hdmi.json
python3 probes/kde/run.py --mode dock --anchor-output eDP-1 --no-active --electron /home/pi/work/ea-md-reader/node_modules/electron/dist/electron --output /tmp/emd-kde-no-active.json
python3 probes/kde/run.py --mode dock --electron /home/pi/work/ea-md-reader/node_modules/electron/dist/electron --min-width 10000 --expect-failure work-area-too-small --output /tmp/emd-kde-too-small.json
```

模型用例运行真实脚本源码，但提供假的 Workspace 与计时器。它们只证明负坐标、小数坐标、尺寸不足、输出移除和有限期限的控制分支。它们不证明硬件、Wayland 协议或 KWin 的实际行为。原生证据没有使用 Xvfb。

## checkpoint 与集成条件

有限寿命 KWin 脚本具备实施基础。阶段 4.3 可以据此设计随应用管理的请求流程。当前原型不包含 `setting.toml`、命令行布局解析、Reader 平台模块或共享 UI。`default` 模式的完整应用验收仍在后续阶段。

负坐标只经过模型，未经过实体屏幕。100%、125% 和 200% 缩放未测。顶、左、右任务栏未测。真实拔屏、打包后的固定身份、Reader 文件对话框和第二实例未测。A4.9 不能据本报告标为全部完成。

后续集成必须把布局错误返回给主进程。主进程必须保留可用于阅读的窗口，并显示错误。当前原型把错误保存为 JSON，未实现 Reader 的错误界面。写入几何时不得直接标记成功，必须读取异步提交后的实际矩形和目标输出。

当前一次性匹配通过标题承载请求标识。若后续方案改用常驻脚本或全局规则，需要重新审查生命周期与身份条件。原型没有提出这个扩展。

## 主源依据

KWin 6.7.5 的 [Workspace 源码](https://github.com/KDE/kwin/blob/v6.7.5/src/scripting/workspace_wrapper.h)公开 `activeWindow`、`activeScreen`、`windowAdded` 和按输出查询的 `clientArea`。其中 `WorkArea` 表示所有屏幕的工作区，`MaximizeArea` 用于当前输出的保留区几何。因此原型使用 `MaximizeArea`。

KWin 6.7.5 的 [Window 源码](https://github.com/KDE/kwin/blob/v6.7.5/src/window.h)公开可写的 `frameGeometry`、窗口输出、PID 和窗口身份。源码区分当前几何与下一次请求几何。这支持异步回读实际几何的验证方式。

KWin 6.7.5 的 [脚本接口](https://github.com/KDE/kwin/blob/v6.7.5/src/scripting/scripting.h)公开脚本加载、命名查询和卸载。[脚本实现](https://github.com/KDE/kwin/blob/v6.7.5/src/scripting/scripting.cpp)注册 `/Scripting/Script<ID>`，并公开 QTimer 与 `callDBus`。本机 D-Bus introspection 与原生执行确认了这些接口。
