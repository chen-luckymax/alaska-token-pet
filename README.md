# 阿拉斯加 · AI Token 桌面宠物

一个跑在 Windows 桌面上的 3D 抽象小猫桌宠：透明窗口、可拖动、可调大小，会呼吸、看左右、伸懒腰、打哈欠，也会吃冰激凌和饭。

> 当前是本地原型版，还没有发布安装包；先在源码目录运行。

![阿拉斯加正面](model/lulu_static_front.png)

## 它现在能做什么

- **3D 真建模**：Blender 建模 + 骨骼 + 9 个动作，不是贴图拼四肢。
- **透明桌宠**：无边框、透明背景、始终置顶；透明区域不挡桌面点击。
- **拖动与大小**：小 / 中 / 大三档；拖动时只改位置，不改窗口尺寸。
- **待机动作**：呼吸、东张西望、晃身、伸懒腰、打哈欠。
- **互动**：单击会眯眼、跳一下，并随机说一句话；双击打开钱包 / 对话面板。
- **吃东西**：冰激凌、小饼干、西瓜、水果米饭；有下颌开合、口腔、舌头、咬合、食物缩小和碎屑。
- **token 钱包**：记录 App 内每次 `glm-5.2` 对话返回的真实 `usage`，显示今日 token、估算花费、本地预算剩余；“账户余额”在未接 OpenCSG 余额接口时明确标为“未接入”。
- **AI 对话**：面板里可以直接聊天；支持 OpenAI 兼容接口，也可以用本机 Ollama 兜底。
- **彩蛋 · 烦恼发明局**：面板第三个标签，把“早上起不来”“找不到钥匙”这类小烦恼做成一份荒诞专利档案；纯本地生成，不消耗 token，可复制或下载 `.txt`。

## 快速开始

```powershell
# 1. 安装依赖
npm install

# 2. 启动
npm start
```

也可以双击 `启动阿拉斯加.cmd`。

## 配置 AI

复制 `.env.example` 为 `.env`：

```powershell
Copy-Item .env.example .env
```

填入任意 OpenAI 兼容服务：

```ini
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-your-key
LLM_MODEL=gpt-4o-mini
```

也支持 OpenCSG AI Gateway 这类兼容网关：

```ini
LLM_API_URL=https://openeast.opencsg.com/aigateway/v1/chat/completions
LLM_API_KEY=sk-your-key
LLM_MODEL=glm-5.2
```

也可以不填远程配置，直接启动本机 Ollama：

```powershell
ollama serve
ollama pull llama3.2
```

`.env` 已在 `.gitignore` 中，不要提交真实 Key。

### 已验证

- OpenCSG `POST /aigateway/v1/chat/completions` + `glm-5.2` 返回 200，`finish_reason=stop`，能正常出中文回答。
- GLM / DeepSeek 会先花 token 在 `reasoning`；`max_tokens` 低于 800 时 `message.content` 可能为空，所以默认预算为 1200。
- 网关的思考字段是 `message.reasoning`，不是 `reasoning_content`；界面只显示 `message.content`。

### 接入豆包 / DeepSeek

项目本来就走 OpenAI 兼容的 `/chat/completions`，所以不需要改代码，只要换 `.env`：

```ini
# DeepSeek（支持账户余额）
LLM_PROVIDER=deepseek
LLM_API_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-your-deepseek-key
LLM_MODEL=deepseek-chat
```

```ini
# 豆包 / 火山方舟（LLM_MODEL 填控制台创建的接入点 ID，通常是 ep-...）
LLM_PROVIDER=doubao
LLM_API_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_API_KEY=your-ark-key
LLM_MODEL=ep-your-endpoint-id
```

- 两家的响应都会返回 `usage`，每次对话都会进入本地账本，面板“最近对话消耗”能看到本轮 tokens 和估算花费。
- DeepSeek 会额外查询 `/user/balance`，成功后“账户余额”显示真实总余额。
- 豆包 / 火山方舟目前没有公开的个人账户余额接口，面板会明确显示“未接入”，请到火山控制台查看余额；不伪造数字。
- OpenCSG 也没有确认可用的余额接口，继续标“未接入”。

### Token 记账边界

- 每发一条对话，主进程从模型响应的 `usage.prompt_tokens` / `completion_tokens` / `total_tokens` 记账。
- 账本保存在 Electron 的 `userData/usage/usage-ledger.json`，重启后今日累计仍在；本次会话 token 从 App 启动开始算。
- `dailyLimit` 和价格表在 `config/settings.json`；默认价格表是本地估算，不代表服务商账单，真实费用以控制台为准。
- 面板底部“最近对话消耗”按每次成功对话列出时间、模型、输入→输出 tokens、总 tokens 和估算花费。
- 账户余额只在服务商确实返回余额时显示；DeepSeek 可查，OpenCSG 和豆包目前显示“未接入”，不会拿本地预算冒充账户余额。
- 相关测试：`npm test` 会跑 `test/check-usage.js`；`test/e2e-usage.js` 用真实模型响应验证 token 是否进入面板。

## 检查与测试

```powershell
npm run check   # JS 语法检查
npm test        # GLB 动画/骨骼结构 + 仓库必要文件
```

## 目录

```text
main.js                 Electron 主进程：窗口、托盘、拖拽、AI 请求
preload.js              IPC 白名单
usage.js                记录 App 对话 usage、本地预算和每日账本
app/                    桌宠与面板页面、Three.js 资源
model/build_cat.py      Blender 建模、骨骼、动作、GLB 导出
app/assets/lulu.glb     当前模型
test/                   GLB 与仓库结构检查
ARCHITECTURE.md         运行结构、模型管线、AI 请求、隐私边界
PROJECT_ROADMAP.md      建模 / 功能 / AI / 开源盘点
```

## 模型与动作

当前 GLB 包含 9 个 clip：

- `Idle_Breathe`
- `Idle_Look`
- `Idle_Wiggle`
- `Idle_Stretch`
- `Idle_Yawn`
- `Idle_Groom`
- `Touch_Happy`
- `Eat_IceCream`
- `Eat_Meal`

重建模型：

```powershell
tools\blender-4.5.16-windows-x64\blender.exe --background --python model\build_cat.py
```

## 已知限制

- 口腔还是简化结构：有下颌、口腔、舌头和两颗小牙，但没有完整牙齿、上颚和食物咬缺口网格。
- 前爪可以抬到脸侧，但还不能真正抓住甜筒/碗边；食物是送到嘴边的。
- `Idle_Groom` 已导出，但抬手时前爪会藏到脑袋后面，暂时不放进随机待机轮换。
- 没有表情 blendshapes，眨眼和鼓腮主要靠骨骼缩放。
- AI 对话目前是单轮请求 + 最近 12 条上下文，没有流式输出和长期记忆。
- 还没有安装包、自动更新、代码签名和多显示器回归。

更完整的缺口和下一步见 [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)。

## 隐私

- token 账本只写本机 `userData`，不上传；Codex / CSG 历史日志不再作为 App 对话的统计来源。
- AI 对话只在点击发送时请求所配置的模型；使用 Ollama 时不出本机。
- API Key 只从 `.env` 或环境变量读取，不写入页面和日志。

## License

- 代码：MIT，见 [LICENSE](LICENSE)。
- 第三方依赖：见 [NOTICE](NOTICE)。
- 模型与动作资产：当前仓库保留所有权利；正式发布前计划单独采用 CC BY 4.0 或 CC0。
