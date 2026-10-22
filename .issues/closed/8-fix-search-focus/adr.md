# ADR-008：保留原生查找，维护搜索框的输入焦点

状态：已采纳并验证，2026-10-19。

## 原因

输入变化在 120 毫秒后触发 Electron `findInPage`。Markdown 排版不依赖查询文本。Chromium 查找命中后会清除元素焦点，并将命中所在 frame 设为原生焦点 frame；HTML iframe 可使 DOM 焦点与键盘接收目标不一致。[Chromium TextFinder](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/editing/finder/text_finder.cc)

## 决策

保留现有自动查找延迟和原生高亮。仅在原生查找进行期间，搜索框在无目标失焦中同步保留焦点；查找完成后重新建立 DOM 与原生 frame 焦点的一致性。点击其他目标、Tab 离开或窗口失焦时，不恢复搜索框焦点。恢复焦点使用 `preventScroll`，不改变查询和输入选区。

查找 IPC 等待对应原生请求的最终结果。新请求或清空操作取消上一个等待，并移除监听器。渲染端只处理最新请求的完成结果，过期完成不会重新操作焦点。

输入框的 DOM Selection 不作为文档查找起点；发起查找前清除该 DOM Selection，保留输入框自身的光标与选区。新查询和内容重载开启新查找，Enter、Shift+Enter 和方向按钮继续当前查找。Electron 的 `findNext` 参数映射到 Chromium 的 `new_session`，初次为 true，后续为 false。[Electron API](https://www.electronjs.org/docs/latest/api/web-contents#contentsfindinpagetext-options)

## 验证边界

使用真实 Electron 完成事件同步，检查后续键盘输入实际写入搜索框，不能只检查 `document.activeElement`。原有命令测试在查找完成后手动点击搜索框，无法发现这个问题。
