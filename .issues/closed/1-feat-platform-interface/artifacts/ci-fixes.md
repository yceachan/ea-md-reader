# CI 验证 checkpoint

第一轮：0decc43，https://github.com/yceachan/ea-md-reader/actions/runs/37532844526 。确认 Windows 透明窗口的全屏状态 API 问题，以及 PR 构建默认跳过签名。对应修复放在 Windows 端口和 ad-hoc CI 签名配置，并经过独立审查。

第二轮：f95ed9e，https://github.com/yceachan/ea-md-reader/actions/runs/37534770335 。Linux、Windows、macOS arm64 成功；Intel 的共享构建、文件契约及打包安装成功，粘贴自动化失败。

第三轮：f91d5db，https://github.com/yceachan/ea-md-reader/actions/runs/37535988656 。观察查找清理调用完成并确认焦点后，arm64 粘贴仍失败；这一尝试没有定位根因。

诊断提交：723977e，https://github.com/yceachan/ea-md-reader/actions/runs/37536788066 。按用户纠偏停止运行，不作为验收结果。诊断和时序猜测代码已在本地撤回，未再次推送。

原始日志仅保留本地；最终 PR 差异将移除日志。剩余问题需原生最小复现，不能通过跳过、放宽权限或重复全套 CI 来取得绿色结果。
