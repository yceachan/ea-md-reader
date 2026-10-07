# 5：Android 工具链与适配路线

状态：规划，待实施。需求与文档验收引用 [raw issue](issue.md)，路线取舍引用 [ADR-005](adr.md)。本文维护工具依赖、阶段和验证。

## 工具链清单

版本核查日期为 2026-10-06。Capacitor 推荐候选为 8.x，实施时锁定同一已验证发行版本的 core、CLI、Android 和相关插件。以下 Android 数值以 Capacitor 8.0 官方升级说明和模板为核查基线，不直接混配每个工具的最新版本。[Capacitor 8 升级说明](https://capacitorjs.com/docs/updating/8-0)记录该组合。

| 依赖 | 用途与候选基线 | 是否必需 |
| --- | --- | --- |
| Node 与 npm | Node 22.12+ 满足当前工程。npm 使用现有锁文件。Capacitor 8 要求 Node 22+ | 必需；当前命令环境已具备 |
| `@capacitor/core`、`@capacitor/cli`、`@capacitor/android` | 承载界面、同步前端产物并生成 Android 外壳，使用相同发行版本 | 选用 Capacitor 时必需，当前未加入 |
| JDK 21 | 构建与编译 Java 原生工程。包含 `java` 和 `javac`，不是仅有 JRE | 必需；当前只确认 Runtime 25 |
| Gradle Wrapper 与 AGP | 8.0 基线为 Gradle 8.14.3、Android Gradle Plugin 8.13.0，使用仓库 Wrapper | 必需；不要求安装全局 Gradle |
| Android SDK Command-line Tools | `sdkmanager` 管理平台、工具、镜像和许可 | 无 GUI 构建必需 |
| SDK Platform 与 Build Tools | 8.0 基线 `compileSdk=36`、`targetSdk=36`、`minSdk=24`。Build Tools 按锁定 AGP/模板选择 | 必需；框架最低版本不是项目兼容性保证 |
| Android Platform Tools | `adb` 安装、设备通信和收集日志 | 设备验证必需 |
| Kotlin 工具插件 | 原生文档与预览端口拟用 Kotlin，8.0 升级说明基线为 2.2.20 | 采用 Kotlin 实现时必需，由 Gradle 管理 |
| Capacitor App 能力 | 前后台与返回键事件，可使用官方 App 插件或必要的本地宿主代码 | 生命周期必需，按实际 API 选择 |
| 本地文档/预览插件 | SAF 授权、ContentResolver、文档接收、无桥 HTML 预览和 TOML 私有文件存储 | 功能必需；不包含编辑器启动能力 |
| Android Studio | 本地调试、SDK 管理与原生工程检查，Capacitor 8 文档最低为 2025.2.1 | 开发便利工具；纯 CLI CI 不需要 GUI |
| Emulator、AVD 与系统镜像 | 可重复的设备测试；x86_64 CI 使用相应镜像，arm64 真机单独复查 | 模拟器 CI 必需，真机可替代本地模拟器 |
| APK 签名、AAB 与 keystore | Debug APK 验证安装。发行构建使用独立 keystore，按渠道需要生成 AAB | Debug 验证必需；正式发行另定范围 |

JDK 21 的依据是 [Capacitor 8.0 Android 源码](https://github.com/ionic-team/capacitor/blob/8.0.0/android/capacitor/build.gradle)的 Java 21 编译目标。当前 Java 25 不直接用于这套 Gradle 8 基线。Gradle 官方将 Java 25 的运行支持列为 9.1.0 起，工具链必须成套选择。[Gradle 兼容矩阵](https://docs.gradle.org/current/userguide/compatibility.html#java)说明这个边界。

Android Studio 和 SDK 的官方环境要求见 [Capacitor 环境说明](https://capacitorjs.com/docs/getting-started/environment-setup#android-requirements)。首版没有 C/C++ 原生依赖，所以不预先增加 NDK、CMake 或 Rust。若最终插件引入本地库，再根据实际 ABI 加入，并检查 Android 页面大小兼容要求。

现有主机缺口由 F5.5 维护。实施前检查完整 JDK、SDK 路径、许可、磁盘和模拟器虚拟化。Linux 模拟器使用 KVM，镜像架构与运行机匹配。[Android 模拟器加速说明](https://developer.android.com/studio/run/emulator-acceleration)是验证依据。

## 适配工作与阶段

| 阶段 | 工作范围 | 完成证据 |
| --- | --- | --- |
| 5.0：最小原型 | 锁定工具链，构建 Capacitor Android 外壳，加载现有阅读样例；同时验证 SAF 读取和无桥 HTML 预览 | 离线 Markdown、交互 HTML 与恶意桥调用样例有实际设备结果。D5.1、D5.4 可以继续或明确改变路线。 |
| 5.1：拆分平台入口 | 提取共享前端构建，避免 Android 构建调用桌面图标与 electron-builder。接入 Android 应用能力实现 | `dist` 可同步到原生外壳。桌面构建和受影响测试继续通过。 |
| 5.2：文档与工作区 | 实现文件选择、目录授权、持久权限、只读 bytes、扫描、相对图片/链接和另存为 | 单文件授权和树授权分别验证。无权限和提供器故障可见，输出 bytes 保持。 |
| 5.3：触摸与视口 | 复用条目 4 覆盖层，增加长按菜单、触摸关闭、返回键、软键盘与安全区域处理 | 手机/平板、横竖屏及分屏下正文不被面板挤压，工具栏可访问，无桌面窗口按钮。 |
| 5.4：变化与恢复 | 验证返回 Reader 前台核对、提供器通知与进程回收恢复。确认没有编辑器设置或启动能力 | 已登记标签更新正确。桌面编辑器入口不会出现在移动端。 |
| 5.5：构建与设备 CI | 固定 Android 构建、单元/契约与设备用例，收集 APK 和设备日志 | 安装启动、文件授权、渲染、前台恢复及边界样例可追溯。性能和未覆盖设备单独记录。 |

每阶段可以用隔离原型验证能力。5.0 没有通过前，不把 Capacitor 路线标为已选定，也不安装一组无依据的第三方文件插件。

## 构建与验证方法

拟定构建过程为 `npm ci`、共享前端构建、`npx cap sync android`，再由 Android Gradle Wrapper 执行 `assembleDebug`、`testDebugUnitTest` 和 `lintDebug`。设备阶段执行 `connectedDebugAndroidTest` 或实际采用的等价设备任务。命令对应未来 Android 工程，本轮不能直接运行。

CI 首选 Linux x64 运行机，将 Android 构建与桌面作业分开。Node、完整 JDK、SDK、Wrapper、系统镜像和 WebView 版本全部记录。选择框架最低 API 的代表设备和当前 target API 设备做兼容探测，再固定项目最低设备范围。

设备测试用原生测试框架验证文件选择器、URI 权限、Activity 生命周期和无桥预览。共享前端的布局可以继续使用浏览器测试，但普通浏览器和现有 Electron Playwright 测试都不能替代 Android 安装与提供器测试。

用户已确认 Android 使用设备远程调试。Debug 构建通过 `adb` 和 Chrome DevTools 检查 WebView，记录实际 WebView 版本。可信界面与独立 HTML 预览分别验证调试可达性，不为调试给文档加入原生桥，也不默认在 Release 构建开启设备调试。[Android WebView 调试说明](https://developer.android.com/develop/ui/views/layout/webapps/debugging)提供对应机制。

首版性能样例覆盖长文档、大量代码、Mermaid、KaTeX、图片及多标签。记录渲染耗时、内存、前后台恢复和低内存回收。先测量，再决定高亮懒加载或标签释放策略，不预先建立另一套渲染框架。

验证文件授权撤销、临时分享权限、云提供器离线、移动/删除、无写权限、原子替换和非法 UTF-8。验证 HTML 不能访问原生桥、设置、任意文档或未经授权的链接。离线状态下 JS、CSS、字体和 WASM 仍可用。

失败保留 Gradle 输出、测试报告、`logcat`、WebView 版本和截图。成功保存可安装 Debug APK，正式签名产物只有在发行范围确定后加入。Release keystore 不进入仓库或 PR 测试，Debug 通过不代表已经可上架。

## 后续讨论与交付

平台接口扩展、编辑器能力排除和 HTML 隔离分别引用 ADR 的 D5.1 至 D5.4。最低 Android/WebView 版本与发行方式在原型后讨论。原生设备远程调试按条目 6 的已确认范围实施，不增加应用内控制台。本条目不把桌面 `right-dock` 搬进移动端。

当前交付是 R5.1 至 R5.6 的规划文档。未来实施时在本 route 逐阶段附版本、提交、产物和设备结果。原始需求与文档验收继续只维护在 raw issue，不另建索引。
