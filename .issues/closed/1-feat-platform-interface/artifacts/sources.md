# 固定集成来源

原工作区 15 个文件的基线为 2cc490b59291c2569058c06142b9b2035808056d，保存提交为 2b6532047ae3dd9365a099c7d33efd482136193b。主工作区另一项未提交的 Typora 主题改动独立保留，未纳入 issue 1。

macOS PR #1 最终 head 为 7051129fd33295905e48dad4e10e94d15e21cc3b，三原生 CI https://github.com/Lysssyo/ea-md-reader/actions/runs/37485765536 成功，经审批 squash 合并为 7cebdef012f4a664e064cdc88a54888779db395b；合入后 CI https://github.com/yceachan/ea-md-reader/actions/runs/37487783710 三作业成功。

本轮集成基于 7cebdef，HTML 集成来源 9783a51、跨平台 CI 来源 9a1917a（cherry-pick 为 6f695e3）、平台与命令实现来源 dce7641（cherry-pick 为 086b3f0）。最终主线使用单一集成 PR squash，以上来源分支保留供追溯。

本地 build 成功，Node 29 pass / 2 原生 macOS skip，Electron UI 5 pass / 1 macOS skip。原始执行输出仅在本地保留，不进入版本库；原生结果以对应 CI run 为准。
