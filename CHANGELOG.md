# Changelog

## 0.6.1 — 2026-11-17

### Token 钱包

- `chat-send` 不再丢弃模型响应里的 `usage`；按 `prompt_tokens` / `completion_tokens` / `total_tokens` 记录本次 App 对话。
- 新增 `userData/usage/usage-ledger.json` 本地账本：今日累计跨重启保留，本次会话从 App 启动重新算。
- 面板大数字改为“今日已用 tokens”，并显示“今日估算花费”和“本地预算剩余”。
- 账户余额明确显示“未接入”，不再用本地 `dailyLimit` 冒充 OpenCSG 账户余额。
- 新增 `config/settings.json`（本地预算、价格表、上下文窗口）和 `test/check-usage.js`。
- 修复面板创建后被系统隐藏的问题：创建时直接可见，并加 watchdog / 重新 `show` 兜底。

### 验证

- 真实 `glm-5.2` 对话返回 `usage.total_tokens = 145`，面板从 `0` 变为 `145`，账本落盘。
- `npm test` 覆盖真实记账、重启持久化、预算扣减和面板字段。

## 0.6.0 — 2026-11-17

### 修复

- 修复主进程 `EPIPE: broken pipe, write`：日志写入改为 `safeLog` / `safeError`，只忽略已关闭输出管道，其他异常继续抛出。
- 面板内容可以纵向滚动，不再因为内容过多而卡住。
- 拖动时不再改变窗口尺寸，大小只由三档按钮控制。

### 模型

- 前爪改为独立的两段手臂 + 三趾手套结构，正面不再是一个圆球。
- 增加上牙、脸颊小骨、腮红鼓起。
- 新增 `Idle_Yawn` 和 `Idle_Groom`，共 9 个动画。
- `Idle_Groom` 抬爪到脸侧；暂未做到真实的抓握和舔爪。

### 功能与 AI

- 面板“对话”页支持内联聊天、Enter 发送、错误气泡和最近 12 条上下文。
- 支持任意 OpenAI 兼容接口；无远程配置时回退本机 Ollama。
- 已用 OpenCSG AI Gateway + `glm-5.2` 验证非流式聊天请求。
- `.env` 只读项目根目录，真实 Key 不进入渲染进程。

### 文档与仓库

- 新增 `README.md`、`LICENSE`、`NOTICE`、`.gitignore`、`.env.example`。
- 新增模型重建脚本说明、GLB 校验脚本和 CI 工作流。

## 0.5.0

- 从水豚改为抽象小猫，再统一用户可见名为“阿拉斯加”。
- 接入 token 钱包、试吃动作、大小切换和透明桌面窗口。
