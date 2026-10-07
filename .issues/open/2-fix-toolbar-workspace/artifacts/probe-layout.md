# 2.0：Electron 尺寸取证

当前 UI 在独立 Xvfb 显示中出现标签栏原生滚动条。单标签存在约 1 CSS px 的纵向溢出。13 个长标签产生横向滚动条后，纵向溢出扩大到 3–6 CSS px。阅读区、活动预览和 HTML iframe 的外层高度一致。HDMI 实机复查仍未取得。

本报告只记录 2.0 的取证结果。需求与验收条件仍以 [raw issue](raw-issue.md) 为来源。正式源码没有修改。

## 环境与范围

基线为 `2b6532047ae3dd9365a099c7d33efd482136193b`。系统为 Fedora 44，Electron 为 44.5.1，Chromium 为 152.0.7977.130。应用运行于独立显示 `:91`，没有操作 KDE 桌面。Xvfb 屏幕为 2880×1800，色深为 24 位，没有窗口管理器。

BrowserWindow 内容边界分别设为 1920×1080 和 2560×1440。系统设备比例固定为 1。应用缩放通过 `webContents.setZoomFactor` 设为 1、1.25、1.5 和 2。CSS px 是页面布局单位，应用缩放会改变它与窗口像素的比例。窗口保持普通状态，没有最大化。

256 个样本覆盖短、长 Markdown 与短、长 HTML。每种内容覆盖单标签、13 个长标签、查找栏关闭或打开，以及面板显示或隐藏。单个长文件名由长 Markdown 和长 HTML 样本覆盖。另有 16 个补充样本，记录真实鼠标拖拽工作区宽度和切换到最后一个标签。

| 内容边界像素 | 应用缩放 | CSS 视口 | renderer devicePixelRatio |
| --- | --- | --- | --- |
| 1920×1080 | 100% | 1920×1080 | 1 |
| 1920×1080 | 125% | 1536×864 | 1.25 |
| 1920×1080 | 150% | 1280×720 | 1.5 |
| 1920×1080 | 200% | 960×540 | 2 |
| 2560×1440 | 100% | 2560×1440 | 1 |
| 2560×1440 | 125% | 2048×1152 | 1.25 |
| 2560×1440 | 150% | 1707×960 | 1.5 |
| 2560×1440 | 200% | 1280×720 | 2 |

## 标签栏尺寸

所有样本的标签栏外高均为 41 CSS px。单标签的 `clientHeight` 为 40，`scrollHeight` 为 41。100% 时，活动标签按钮实际高为 42，按钮上下 padding 合计 24。按钮比可用高度高 2 CSS px，超出 ADR 中的 1 CSS px 边界容差。

标签栏仅声明 `overflow-x: auto`，但浏览器计算出的 `overflow-y` 也是 `auto`。单标签在 100% 和 125% 时可以产生纵向位移。150% 和 200% 的整数高度差仍为 1，实际位移受到设备像素取整影响。整数高度差不能单独代替实际滚动检查。

13 个长标签的 `scrollWidth` 为 3167。横向原生滚动条减少可用高度。100% 时，`clientHeight` 从 40 降为 30，`scrollHeight` 为 36。截图同时显示底部横向条和右侧纵向条。查找栏及面板开关没有改变这一故障。

下表使用 1080p、长 Markdown、面板显示、查找栏关闭的样本。`clientHeight` 是内层可用高度。`offsetHeight` 是外高。`scrollHeight` 是滚动内容高度。

| 缩放 | 标签状态 | clientHeight | offsetHeight | scrollHeight | 活动按钮实际高 | clientWidth / scrollWidth |
| --- | --- | --- | --- | --- | --- | --- |
| 100% | 单标签 | 40 | 41 | 41 | 42 | 1908 / 1908 |
| 100% | 13 长标签 | 30 | 41 | 36 | 42 | 1908 / 3167 |
| 125% | 单标签 | 40 | 41 | 41 | 40.80 | 1526 / 1526 |
| 125% | 13 长标签 | 32 | 41 | 37 | 40.80 | 1526 / 3167 |
| 150% | 单标签 | 40 | 41 | 41 | 41.33 | 1279 / 1279 |
| 150% | 13 长标签 | 34 | 41 | 38 | 41.33 | 1272 / 3167 |
| 200% | 单标签 | 40 | 41 | 41 | 41.50 | 953 / 953 |
| 200% | 13 长标签 | 35 | 41 | 38 | 41.50 | 953 / 3167 |

这些数据支持先修正标签内容高度，再处理滚动条外观。正常标签内容需要容纳明确行高、badge 边框和 padding。多标签还需要保留横向访问能力。当前证据没有支持修改正文区域高度。

## 正文与标签访问

256 个样本中，阅读区与工作区的高度差均为 0。活动文档面板与阅读区的高度差均为 0。HTML iframe 与活动文档面板的高度差均为 0。状态栏底边始终位于视口内，应用外层滚动内容没有超高。所有样本没有 renderer 错误。

短 Markdown 与短 HTML 的实际最大滚动位置均为 0。长 Markdown 可以在 `.document-panel` 滚动。长 HTML 可以在 iframe 内部滚动。以 1080p、100%、查找栏关闭为例，长 Markdown 的正文可用高度为 952，滚动内容高度为 19502。长 HTML 的内部可用高度为 952，滚动内容高度为 9685。

工作区宽度从 240 拖到 322.5 CSS px 后，阅读区与预览的高度仍一致。随后从首标签调用现有 `emd:action` 的 `previous` 动作，活动标签切换到第 13 个。该动作与现有快捷键使用同一处理入口，没有发送全局键盘操作。所有 8 个补充切换样本中，标签栏 `scrollLeft` 仍为 0，活动标签完全处于可视区外。1080p 长 Markdown 样本的活动标签横界为 2881–3121，标签栏右界为 1919。

## 原始产物与复跑

原始尺寸数据位于 [measurements.json](/home/pi/work/ea-md-reader-probe-layout/probes/layout/measurements.json)。采集脚本位于 [run.cjs](/home/pi/work/ea-md-reader-probe-layout/probes/layout/run.cjs)。探测分支为 `codex/probe-layout`，最终提交为 `5c890c0afd0fd8e77012945029d144e242c3bfe8`。提交只包含脚本、数据和截图忽略规则，没有推送。

16 张截图保留在 `/home/pi/work/ea-md-reader-probe-layout/probes/layout/screenshots/`，没有提交。截图使用 `BrowserWindow.capturePage()`，像素尺寸与内容边界一致。原先的 Playwright 截图在 Electron 缩放后产生裁切，最终产物没有使用该方式。代表截图为 [1080p、100%、长 Markdown](/home/pi/work/ea-md-reader-probe-layout/probes/layout/screenshots/1920x1080-long-md-z1.png) 和 [1440p、200%、长 HTML](/home/pi/work/ea-md-reader-probe-layout/probes/layout/screenshots/2560x1440-long-html-z2.png)。全部截图路径和尺寸记录在原始数据中。

复跑前，在探测目录执行 `npm ci` 和 `npm run build`。独立 Xvfb 使用 `/tmp/emd-layout-xvfb/usr/bin/Xvfb :91 -screen 0 2880x1800x24 -nolisten tcp -ac`。该二进制来自当前 Fedora 仓库的 RPM，只解包到临时目录，没有安装系统软件。Xvfb 运行后，在探测目录执行 `DISPLAY=:91 node probes/layout/run.cjs`。脚本重新生成尺寸数据与截图。

## HDMI 开发者检查点

当前证据来自虚拟显示，不能标记为“HDMI 已复现并修复”。本轮没有 HDMI 分辨率、系统缩放或真实窗口最大化结果。macOS 与 Windows 也不在本轮取证范围内。

开发者必须在用户报告问题的 HDMI 屏上记录显示器分辨率、系统缩放、Electron 缩放和窗口状态。先记录单个长文件名标签，再记录 13 个长标签。每种标签状态打开和关闭查找栏，并显示、隐藏和调整面板。记录标签栏 `clientHeight`、`offsetHeight`、`scrollHeight`、`clientWidth`、`scrollWidth` 和 `getBoundingClientRect()`。同时保存整个窗口截图，注明滚动条方向。

如果已实施高度修复，开发者再比较普通窗口、最大化与还原状态。标签栏不得出现纵向内容溢出，短内容不得增加外层滚动。长 Markdown 与 HTML 内部页面必须仍能滚动。切换到原先不可见的标签时，该标签必须进入视区。只有 HDMI 屏取得这些结果后，才能关闭硬件检查点。
