# Windows 本地安装打包修复

Windows 打包改为通过 `electronDist` 复制项目已安装的 Electron，避开解压后将 `win-unpacked.tmp` 重命名为 `win-unpacked` 的失败步骤。`afterExtract` 清理示例应用和版本文件，保持应用包内容与原流程一致。

- [失败复现](reproduction.txt)：原配置重跑仍出现 EPERM；打包进程退出后，同目录重命名成功。当前证据定位到解压后的重命名步骤，未确认具体持有文件句柄的进程。
- [验证结果](verification.txt)：修复后真实打包、当前用户安装、13 项相关测试和安装文件一致性检查通过。

环境：Windows 10.0.22631、Node.js 24.20.0、electron-builder 26.15.3、Electron 44.5.1、x64。基线提交：`fce6300`。

配置依据：[electron-builder 的 electronDist 文档](https://www.electron.build/v26/docs/api/app-builder-lib.interface.configuration/)。实现位于 `scripts/platforms/windows.mjs`，回归检查位于 `tests/windows-platform.test.mjs`。
