# Windows 与 Linux 安装升级验证

源码安装以 `npm run install:local` 为入口，重复执行同一命令升级。已有构建与应用包继续按内容指纹复用；准备新版本后，以完整目录替换旧版本，配置保存在应用目录之外。

Windows 保留 `beforePack` 初始化 Electron、`electronDist` 复制运行文件的打包路径。安装目录重命名遇到 `EPERM` / `EBUSY` 时，最多执行八次，累计等待 12.7 秒；持续占用时抛出原始错误，旧应用仍在原位置。注册表或快捷方式集成失败时恢复旧版本。

Linux 将新应用复制到安装数据目录下的临时目录，再移动旧版本并替换。完整替换清除已删除的旧文件，并避开直接覆盖运行中 ELF 可执行文件的 `ETXTBSY`。新目录切换失败时恢复旧目录；恢复失败时保留恢复目录并报出位置。

## 本机证据

环境：Windows 10.0.22631，x64，Node.js 24.20.0，Electron 44.5.1，electron-builder 26.15.3。

- [全新依赖安装](cold-npm-ci.txt)：独立目录执行 `npm ci`，打包前 `node_modules/electron/dist` 不存在。
- [干净环境的默认打包](cold-default-pack.txt)：移除 Windows 运行文件复制配置后，默认下载、解压和目录重命名在本次实验中成功。此前失败证据见 [原工作区复现](../windows-package-rename-2026-10-26/reproduction.txt)。
- [全新环境的复制方案发行构建](cold-copy-dist.txt)：保留复制配置，从缺失运行文件的环境初始化 Electron 并生成 Windows 原生目录、NSIS、ZIP。
- [初始 Node 测试](node-tests.txt)：真实文件句柄覆盖占用释放后升级成功、持续占用失败且保留旧版本；包含注册表与快捷方式失败回滚。[最终 Windows 测试](windows-lock-final.txt)覆盖 4 秒占用释放与 12.7 秒持续占用边界，8 项通过。Linux 专属行为由原生 Linux CI 验证。
- [本机原生包验证](windows-packaged.txt)：隔离桌面中执行实际 Electron 进程的安装、启动、退出后升级和卸载；升级后重新启动安装目录中的应用。

## 远端证据

- [首轮 CI](https://github.com/yceachan/ea-md-reader/actions/runs/40503688916)：Windows 升级在累计等待 3.1 秒后仍出现目录重命名 `EPERM`；[进程日志](ci-first-electron-process.txt)记录启动器已正常退出。[Windows 错误](ci-first-windows.txt)与 [Linux UI 错误](ci-first-linux.txt)分别归档。Linux 原生包的安装、升级与卸载通过；开发 UI 的滚动断言等待到了文件写入，尚未等到异步渲染提交，增加正文更新断言同步，[本机定向重复验证](editor-sync.txt)三次通过。
- [第二轮 CI](https://github.com/yceachan/ea-md-reader/actions/runs/40505376572)：三平台全部通过。Windows 失败时的只读诊断能记录拒绝删除共享访问的路径及安装目录中的残留进程；本次未触发诊断。
- Windows 后续重试边界扩大到 12.7 秒，真实文件锁测试改为持有 4 秒后释放，覆盖首轮 CI 暴露的旧等待窗口不足问题。具体锁持有者尚未定位。

Linux CI 的安装副本重新配置 sandbox helper 的 root 属主与 4755 模式，与现有 Ubuntu runner 的沙箱准备要求一致。测试保持 Chromium sandbox 开启。

## 机制依据

- [electron-builder electronDist](https://www.electron.build/v26/docs/api/app-builder-lib.interface.configuration/)：支持预先解压的 Electron 目录；本工程使用同平台同架构原生打包。
- [Windows 文件共享模式](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea)：已有句柄的共享模式持续到句柄关闭，删除与重命名要求兼容的共享权限。
- [Linux rename](https://www.man7.org/linux/man-pages/man2/rename.2.html)：重命名保留已打开文件描述符的有效性。

原 Linux 失败为 HTTP 504，发生在打包下载阶段；日志没有记录失败 URL。当前证据定位到网关与上游服务超时，具体端点仍未确认。远端验证结果归档于本目录的 CI 记录。
