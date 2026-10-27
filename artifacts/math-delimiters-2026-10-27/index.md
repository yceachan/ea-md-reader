# 跨行显示公式识别与修复

Reader 当前漏识别“分隔符与公式首尾同行、公式内容跨行”的 `$$…$$`。故障发生在 Marked 的数学 token 识别阶段：整段进入 `paragraph → text`，尚未调用 KaTeX。用户给出的 LaTeX 可由 KaTeX 正常解析。

## 识别边界

入口为 [markdown.ts](../../src/lib/markdown.ts)，使用 `marked-katex-extension({ throwOnError: false, nonStandard: true })`。本次依赖版本为 Marked 18.0.14、marked-katex-extension 5.1.13、KaTeX 0.18.10。

插件 [index.ts](../../node_modules/marked-katex-extension/src/index.ts) 的两条规则留下了跨行紧凑写法的空隙：

- `blockRule` 要求起始分隔符后立即换行、结束分隔符前换行。
- `inlineRuleNonStandard` 的公式内容排除换行，适用于单行公式。
- `nonStandard` 放宽行内公式周边文本的限制，公式内容中的换行仍被排除。

原文 42 个显示公式中，19 个被识别，23 个跨行公式以字面文本输出。源码在渲染前统一 CRLF 为 LF；问题在 LF 输入上同样复现。

## 补丁边界

在项目的块 tokenizer 扩展中增加紧凑跨行写法，沿用插件的 `blockKatex` token 和原 renderer。补充语法未命中时，继续由插件处理原有语法；保持现有单行公式与独立分隔符的行为。

补充语法限于段落起始的 `$$`，结束 `$$` 后只允许水平空白与行尾。识别未转义的双美元符号，内容跨行且不越过空行。列表和引用沿用 Marked 提供的容器内分词。代码围栏、代码跨度、缩进代码和转义文本沿用现有 Markdown 分词。

实现见 [markdown.ts](../../src/lib/markdown.ts)，回归检查见 [reader.spec.cjs](../../tests/reader.spec.cjs)。用户笔记保持原文。

这条路线把支持范围补充在数学语法所属的 tokenizer 中。若改用全文正则预处理，必须额外识别代码、转义和容器边界；若将所有数学规则改为允许换行，则会同时改变单美元行内公式的边界。二者均扩大了本次修复范围。

用户笔记也可临时将开闭 `$$` 各放在独立行中，现有插件即可识别。产品补丁允许原文保留当前格式。

## 验证证据

- [probe.cjs](probe.cjs)：可重复执行的探测与断言，使用真实 `renderMarkdown`，经 DOMPurify 后检查 DOM；浏览器为本机 Edge 的无头模式。基线源码固定为 `d4ef9d310cb1178de3e99e62d077dd30b5b2562c`，与工作区的实际修复对比。
- [results.json](results.json)：分词、KaTeX 直调及修复前后的 24 组输入对比，含用户全文。基线全文 19 个 `.katex-display`，修复后 42 个，零 `.katex-error`，普通段落中无残留 `$$`。
- [targeted-ui.txt](targeted-ui.txt)：实际 Electron 应用的公式分隔符与 Mermaid/KaTeX 两项回归通过，Windows 测试桌面未激活。
- [check.txt](check.txt)：TypeScript 类型检查通过。
- 命令：`node artifacts/math-delimiters-2026-10-27/probe.cjs "C:/Users/yceachan/Desktop/Lessons/通信原理/cap3/习题2-解答.md"`。

边界样例包含三种分隔符布局、`aligned`、连续公式、代码围栏与代码跨度、转义、中文标点、单美元跨行、未闭合、空行、引用、列表、callout、缩进代码及 CRLF。

额外观察：`:::callout` 后未显式写图标时，现有 callout 正则会把下一行吞为图标。该行为在修复前后保持一致；显式图标 `:::callout 💡` 内的跨行公式正常识别。这是另一处解析边界，本次补丁保留其既有行为。

本机完成无头探测、类型检查与隔离桌面的定向 Electron 回归。远端 CI 结果由本目录的 CI 记录归档。
