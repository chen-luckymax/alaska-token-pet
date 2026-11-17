# 架构

## 运行结构

```text
Electron 主进程 main.js
├─ 透明宠物窗口 app/index.html + app/pet.js + Three.js
├─ 面板窗口 app/panel.html + app/panel.js
├─ tray / IPC / 尺寸 / 拖拽
├─ usage.js：读取本机 Codex / CSG token 会话
└─ AI 路由：OpenAI 兼容远程接口 → Ollama 本机兜底
```

`preload.js` 只暴露白名单 IPC；渲染进程拿不到 Node、文件系统和 API Key。  
主进程读取项目根目录 `.env`，只把请求结果回传给面板。

## 模型管线

```text
model/build_cat.py
  → Blender 网格、骨骼、权重、9 个 Action
  → model/lulu_static.blend
  → app/assets/lulu.glb
  → Three.js GLTFLoader + AnimationMixer
```

关键点：

- 身体用 loft 生成，再 remesh 成一张连续皮肤。
- 手臂、手掌、三趾、耳朵、尾巴、口腔/舌头/牙齿是独立部件；手掌和手臂不参与身体 remesh，避免被“吃掉”。
- `jaw` 排除在 auto weights 外，否则张嘴会把下巴拉到项圈。
- 动画以 NLA Action 导出；每个 clip 都重置全身姿态，避免上一段动作残留。

## AI 请求

```text
panel.js → preload.chatSend(messages)
        → main.js chat-send
        → POST {LLM_API_URL}/chat/completions
        → Authorization: Bearer {LLM_API_KEY}
```

- 远程配置优先；没有 URL 或 Key 时走 `http://127.0.0.1:11434/v1`。
- 45 秒超时，最多 12 条消息，`max_tokens` 默认 1200。
- GLM / DeepSeek 等推理模型会先消耗 reasoning token；预算太小会导致 `content` 为空，因此不要低于 800。

## 隐私边界

- token 用量只读本机日志，不上传。
- 只有点击发送时才请求模型；Ollama 模式不出本机。
- `.env` 在 `.gitignore` 中；不要把 Key 写入 README、截图或 issue。

## 已知技术债

- 前爪可以抬到脸侧，但不能抓握甜筒/碗边。
- 口腔没有完整上颚、牙齿和食物咬缺口。
- 没有表情 blendshapes；眨眼靠 eye 骨缩放。
- 没有流式输出、长期记忆、语音和视觉。
- 没有安装包、代码签名、自动更新和多显示器自动化回归。
