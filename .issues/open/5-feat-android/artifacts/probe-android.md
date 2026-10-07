# 5.0：Android 隔离原型

最小阅读外壳已准备完成。前端构建、Android 资源同步、JDK 21 和 Gradle 版本运行检查通过。SDK 许可没有取得明确接受，因此本轮没有下载 SDK，没有编译或安装 APK，也没有运行设备测试。5.0 的设备门槛仍未通过，Capacitor 路线仍是待验证选择。

本报告维护当前 5.0 结果。需求以 [raw issue](raw-issue.md) 为来源。运行时与隔离取舍以 [ADR-005](adr.md) 为来源。本轮后续授权允许建立隔离原型，正式 Android 应用没有集成这些改动。

## 锁定版本与实测环境

核查日期为 2026-10-06。官方 GitHub 发行页与 npm 的稳定标签均指向 Capacitor 8.5.2。core、CLI 和 Android 包全部锁为 8.5.2，没有使用 9.0 alpha、nightly 或其他包的最新版本。[官方 8.5.2 发行](https://github.com/ionic-team/capacitor/releases/tag/8.5.2)支持该选择。

Android 工程来自该版 CLI 模板。模板保留 AGP 8.13.0 与 Gradle 8.14.3。Capacitor Android 库的 Java 编译目标为 21，所以本轮准备完整 JDK 21，包含 `java` 和 `javac`。[8.5.2 Android 构建源码](https://github.com/ionic-team/capacitor/blob/8.5.2/android/capacitor/build.gradle)记录该编译目标。

| 项目 | 锁定值或实测值 | 当前结果 |
| --- | --- | --- |
| 主机 | Fedora 44，Linux x86_64 | 已检查 |
| Node / npm | 22.23.1 / 10.9.8 | 已运行 |
| Capacitor core / CLI / Android | 全部 8.5.2 | 锁文件一致 |
| 前端 Vite / TypeScript | 7.3.6 / 5.9.3 | 构建通过 |
| JDK | Temurin 21.0.12.1+1-LTS | `java` 与 `javac` 通过 |
| AGP / Gradle | 8.13.0 / 8.14.3 | Gradle 运行通过，原生构建未运行 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 | 模板值，项目兼容性未验证 |
| SDK Build Tools | 35.0.0 | AGP 默认值，未安装 |
| Android 源码语言 | Java | 没有增加 Kotlin 插件 |
| SDK / adb / Emulator | 未安装或未在 PATH 中发现 | 构建与设备验证缺口 |
| `/dev/kvm` | 存在且当前用户可读写 | 未运行模拟器加速检查 |

AGP 8.13 的官方默认 Build Tools 是 35.0.0，SDK 36 不表示必须混配 Build Tools 36。该 AGP 的最低 Gradle 为 8.13，模板的 8.14.3满足这一要求。[AGP 8.13 兼容表](https://developer.android.com/build/releases/agp-8-13-0-release-notes?hl=en)记录这些值。Android Studio 不是本轮运行工具。若开发者使用 IDE，Capacitor 8 要求 2025.2.1 或更新版本。[环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)记录 IDE 要求。

JDK 与 Gradle 都放在 `/home/pi/.cache/emd-android-probe/`，没有安装系统软件。两份归档的 SHA-256 均与官方发行元数据一致。Gradle Wrapper 的 Java HTTPS 下载超时，错误日志已保留。随后通过 curl 下载同一官方归档，校验后运行本地 Gradle 8.14.3，JVM 明确为 JDK 21。这只验证工具可以启动，不表示 Android 工程构建通过。

## 可审阅的原型

原型目录为 `/home/pi/work/ea-md-reader-probe-android/probes/android/`。提交为 `a910b409844a09a4ebe92c801c751958f5efd0dd`，分支为 `codex/probe-android`。提交包含独立工程源码、样例、锁文件、Gradle Wrapper 和 [版本清单](/home/pi/work/ea-md-reader-probe-android/probes/android/versions.json)。没有推送。正式仓库源码与现有测试没有修改。

前端直接复用现有 `src/lib/markdown.ts` 和 `src/markdown.css`。离线样例覆盖 Markdown、Shiki 代码高亮、KaTeX 公式和 Mermaid。必要 JS、CSS、字体和 WASM 已同步为本地资源，构建产物共 433 个文件、14939532 bytes。输入控件保持禁用。相对图片在插入 DOM 前被替换为目录授权提示，单文件授权不扩展到相邻资源。

[DocumentsPlugin.java](/home/pi/work/ea-md-reader-probe-android/probes/android/android/app/src/main/java/io/github/yceachan/emd/probe/DocumentsPlugin.java)实现系统文档选择器入口。它通过 ContentResolver 读取 `content://`，只请求临时读取权限。它检查显示名称与 MIME 类型，拒绝非法 UTF-8，保留原始 bytes。此原型限制单文件为 8 MiB，避免在 WebView 桥传输中无界占用内存。提供器拒绝、读流失败和格式错误会返回可见错误。

HTML bytes 保存在应用私有快照中，不插入可信 Capacitor 页面。[HtmlPreviewActivity.java](/home/pi/work/ea-md-reader-probe-android/probes/android/android/app/src/main/java/io/github/yceachan/emd/probe/HtmlPreviewActivity.java)使用独立普通 Activity 和 WebView。它没有注册 JavaScript interface 或 WebMessage 原生桥。它通过固定本地 HTTPS 响应加载快照，限制网络、文件、content URI、导航、下载和页面权限。CSP 允许内联脚本与样式，保留自包含页面交互。以上是源码设计，隔离效果还没有设备证据。

原型包含交互 HTML 与恶意桥调用样例。[HtmlPreviewTest.java](/home/pi/work/ea-md-reader-probe-android/probes/android/android/app/src/androidTest/java/io/github/yceachan/emd/probe/HtmlPreviewTest.java)准备了两项真实 WebView 测试：计数交互，以及原生桥缺失与网络请求失败。这两项测试尚未运行。Debug 宿主可供设备远程调试，Release 不默认开启 WebView 调试。移动端没有编辑器入口、编辑器配置或编辑启动接口。

## 已完成与未完成验证

`npm run build` 通过 TypeScript 检查与 Vite 构建。`npx cap sync android` 成功同步本地资源和配置。Android 源码 XML 可以解析。锁文件中的三个 Capacitor 包版本一致，Gradle 归档校验和已写入 Wrapper 配置。日志保留在 `/home/pi/work/ea-md-reader-probe-android/probes/android/artifacts/`，没有提交。

本轮没有运行 `assembleDebug`、`lintDebug` 或 `connectedDebugAndroidTest`。没有 APK、Android 截图、WebView 版本或 logcat。没有把浏览器或 Electron 渲染计为 Android 设备结果。USB 清单没有显示明确的 Android 设备标识，但 adb 不可用，因此不能确认设备通信状态。

SAF 选择、权限授予、真实提供器读取、独立 HTML 交互与恶意桥调用都需要设备复查。目录树授权、持久权限、重读、相对资源、另存为、分享 Intent、进程恢复和完整移动布局仍在后续阶段。当前 `minSdk=24` 只是框架模板值，不能作为本项目已经支持 Android 7 的承诺。

## SDK 许可检查点

下一步需要开发者明确接受 Google 的 Android Software Development Kit License Agreement。官方 Command Line Tools 下载页在下载前要求同意条款，条款也将使用 SDK 视为接受行为。本会话只授权准备工具和原型，没有明确接受这份许可，所以本轮没有下载或使用 SDK，也没有写入许可 hash。[Android 下载条款](https://developer.android.com/studio#command-tools)是此检查点的来源。

许可接受后，最小构建需要 Command Line Tools、`platforms;android-36`、`build-tools;35.0.0` 和 `platform-tools`。模拟器验证另需 Emulator 与所选 x86_64 系统镜像。系统镜像尚未选择或下载。如果安装器显示额外镜像或 Google API 许可，开发者必须逐项阅读并明确接受，不预先接受所有许可。[sdkmanager 许可说明](https://developer.android.com/tools/sdkmanager)记录逐包许可要求。

开发者可以先审阅上述提交，再确认许可接受与设备路径。已有 Android 真机可以代替本地模拟器。若选择模拟器，先运行加速检查，再建立对应 AVD。CLI 安装过程没有使用 `yes`，没有自动接受条款，也没有安装与当前原型无关的 NDK、CMake 或 Android Studio。

## 继续执行入口

在原型工作目录先安装根目录依赖，再安装隔离工程依赖。前端构建不调用桌面图标生成。当前两层锁文件都必须保留。

```sh
cd /home/pi/work/ea-md-reader-probe-android
npm ci
npm --prefix probes/android ci
npm --prefix probes/android run sync
```

如果 SDK 许可已明确接受并且对应 SDK 已安装，开发者再执行原生构建。`ANDROID_HOME` 必须指向实际 SDK，不能用空目录代替。下面命令使用本轮已校验的完整 JDK。

```sh
cd /home/pi/work/ea-md-reader-probe-android/probes/android/android
JAVA_HOME=/home/pi/.cache/emd-android-probe/jdk21 ./gradlew assembleDebug lintDebug
JAVA_HOME=/home/pi/.cache/emd-android-probe/jdk21 ./gradlew connectedDebugAndroidTest
```

设备复查先在断网状态启动离线样例，再从系统选择器读取 Markdown 与 HTML。验证交互 HTML 的计数按钮，运行桥调用样例，检查宿主日志与 WebView 版本。保存 APK、测试报告、logcat 和屏幕截图。取得这些真实结果后，再决定 5.0 门槛是否通过。
