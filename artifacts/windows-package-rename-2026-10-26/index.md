# Windows 本地安装打包修复

Windows 打包先通过 `beforePack` 导入 Electron，触发运行文件的按需下载，再通过 `electronDist` 复制运行文件，避开解压后将 `win-unpacked.tmp` 重命名为 `win-unpacked` 的失败步骤。`afterExtract` 清理示例应用和版本文件，保持应用包内容与原流程一致。

- [失败复现](reproduction.txt)：原配置重跑仍出现 EPERM；打包进程退出后，同目录重命名成功。当前证据定位到解压后的重命名步骤，未确认具体持有文件句柄的进程。
- [验证结果](verification.txt)：修复后真实打包、当前用户安装、13 项相关测试和安装文件一致性检查通过。
- [首次修复的 CI 失败](ci-failure.txt)：Electron 44 在首次导入时安装运行文件，全新 `npm ci` 后尚无 `dist`；首次修复依赖了开发机已有的运行文件。`beforePack` 显式完成初始化，初始化失败时中止打包。
- [全新依赖环境复查](ci-fresh-verification.txt)：从没有 Electron 运行文件的环境完成类型检查、发行打包和全部适用 Node 测试。
- [Windows CI 后续检查](ci-test-timing.txt)：打包通过后，开发模式首次 Markdown 排版超出默认 5 秒等待；首次排版断言改为与启动检查一致的 30 秒，并完成隔离桌面重复验证。[首次升级测试错误](ci-upgrade-failure.txt)在下一次同提交运行中通过。

环境：Windows 10.0.22631、Node.js 24.20.0、electron-builder 26.15.3、Electron 44.5.1、x64。基线提交：`fce6300`。

配置依据：[electron-builder 的 electronDist 文档](https://www.electron.build/v26/docs/api/app-builder-lib.interface.configuration/)。实现位于 `scripts/platforms/windows.mjs`，回归检查位于 `tests/windows-platform.test.mjs`。
