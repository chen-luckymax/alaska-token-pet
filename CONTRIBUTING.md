# Contributing

## 本地运行

```powershell
npm install
npm start
```

## 检查

```powershell
npm run check
npm test
```

`npm run check` 做 JS 语法检查；`npm test` 检查 GLB 动画/皮肤结构和仓库必要文件。

## 模型改动

1. 改 `model/build_cat.py`，不要手改 `app/assets/lulu.glb`。
2. 运行：

```powershell
tools\blender-4.5.16-windows-x64\blender.exe --background --python model\build_cat.py
```

3. 看 `model/lulu_static_front.png` 和 `model/lulu_static_threequarter.png`，确认没有把手指、耳朵、牙齿重新 remesh 掉。
4. 如果改了动作，导出后用 GLB 校验脚本确认 clip 数没有变少。

## AI 配置

不要提交 `.env`。使用 `.env.example` 作模板：

```powershell
Copy-Item .env.example .env
```

在 issue / PR 里不要贴 Key、完整请求头或带 Key 的日志。

## 提交前

- 不要提交 `node_modules/`、`tools/`、`tmp-user-data*`、日志、截图和 `.env`。
- 不要提交未授权的第三方角色、贴图、音效。
- 提交信息用一般现在时，例如 `fix: handle EPIPE in logger`。
