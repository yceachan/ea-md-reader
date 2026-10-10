# Ea.Md.Reader · emd

一个纸色主题的 Markdown 阅读与源码编辑器，也能预览自包含 HTML 页面。基于 Electron，排版来自 [ea-kb](https://yceachan.github.io/)。

- 多标签页、文件树、目录、文内查找与可调整的侧栏。
- Markdown 源码编辑、手动保存、预览切换时自动保存；外部文件更新自动载入，保存冲突保留草稿。
- 支持表格、任务列表、公式、代码高亮、Mermaid 图表和图片放大。

支持 **Linux KDE、Windows、macOS**。GNOME 集成尚未完成；macOS 的专注启动布局尚未实现。

## 安装与运行

在目标系统上构建，需要 Node.js **22.12+** 和 npm。Linux 还需要 CMake、C++ 编译器、KDE KIO 开发库、`setsid` 与 `desktop-file-utils`；Windows 需要 PowerShell 7（`pwsh.exe`）。

Linux 构建依赖：Ubuntu 24.04 使用 `g++ cmake extra-cmake-modules libkf5kio-dev`，Fedora 使用 `gcc-c++ cmake kf6-kio-devel`。

```sh
npm ci
npm run build
npm run pack
npm run install:local
```

安装只作用于当前用户，不改变现有默认文件关联。Linux 与 macOS 的终端入口位于 `~/.local/bin`，请将其加入 `PATH`。

```sh
emd "文档.md" "页面.html"
```

也可从系统应用菜单或文件的“打开方式”启动。卸载使用 `npm run uninstall:local`，用户偏好会保留。更新源码后重新执行构建、打包、安装；`npm run dist` 可生成当前平台的发行档案。macOS 构建使用本地 ad-hoc 签名，尚未配置 Developer ID 签名与公证。

## 支持范围

文件需要使用 UTF-8。MDX 按普通 Markdown 渲染，不执行 JSX；Markdown 中的脚本不会执行。

HTML 保留自身样式和内嵌脚本，在隔离页面中运行。当前支持自包含页面，不加载外部脚本、样式或相对资源。HTML 仅提供预览。

源码编辑使用 `Ctrl+/` 切换模式，`Ctrl+S` 保存（macOS 保存为 `Cmd+S`）。另存为不复制文档引用的图片。

## 开发

```sh
npm run dev        # 开发与热更新
npm run check      # 类型检查
npm run build      # 准备发布构建
npm test           # Node 与 Electron UI 测试
```

项目资料卡片由仓库根目录的 `setting.toml` 构建，头像来自 `public/`；修改后需要重新构建。编辑器和启动布局偏好由应用设置保存。

Linux UI 测试需要 Xvfb、Openbox 与 xprop。测试使用虚拟显示或隔离桌面；Windows Shell 场景需要专用 Windows 11 CI 桌面。

欢迎通过 [Issues](https://github.com/yceachan/ea-md-reader/issues) 报告问题或提交改进。

## 许可与致谢

[MIT License](LICENSE) · yceachan。阅读主题与渲染排版来自 [yceachan.github.io](https://github.com/yceachan/yceachan.github.io)。
