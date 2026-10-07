# Issue 2：桌面 UI 收尾

2026-10-07 按用户要求完成主线收尾并关闭。顶栏操作顺序、SVG 状态与颜色符合最终确认；工作树保留根目录和文件树，空白处通过系统菜单重载。标签栏固定高度、隐藏原生滚动条，滚轮横向访问及活动标签自动可见；正文和 HTML 保持各自滚动。

个人资料卡片从共用 TOML 独立读取，logo 为入口；头像随应用打包，三行导航交给系统打开。仓库链接仅显示 owner/repo。TOC 的吸附组件归属已关闭的 [issue 4](../4-feat-startup-layout/close.md)。

自动验证覆盖布局尺寸、不同缩放、菜单及资料更新。用户 HDMI 设备上的原始故障没有独立实机复现记录，关闭范围为已实现的容器修复与桌面 UI，不把模拟显示器结果写成 HDMI 实测。

运行验证见 [artifacts](/home/pi/.codex/artifacts/ea-md-reader/repository-cleanup-20261007-222101/verification.md)。
