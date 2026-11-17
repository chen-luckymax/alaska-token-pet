# 小猫版噜噜（Blender 真建模）

## 产物

- `model/build_cat.py`：从零重建小猫的程序化建模脚本；连续蒙皮身体、三角耳、长尾、项圈/铃铛、顶点色、骨架、7 个动作、4 视角渲染、GLB 导出。
- `model/lulu_static.blend`：本次小猫的 Blender 工程（覆盖了旧水豚版工程；旧版备份在 `model/capybara_backup/`）。
- `app/assets/lulu.glb`：App 当前加载的小猫 GLB。
- `model/lulu_static_front.png` / `_threequarter.png` / `_side.png` / `_back.png`：小猫四视角。
- `snapshot-electron.png`：小猫接入 Electron 后的透明窗口离屏截图。
- `panel-check.png`：460×610 钱包面板的下滚截图。
- `cat-glb-front.png` / `cat-stretch.png`：Three.js 中从 GLB 读取的待机/伸懒腰帧。

## 重建

```powershell
& "C:\Users\陈懒人\Desktop\Token-Cat-v0.5.0\LuluPet\tools\blender-4.5.16-windows-x64\blender.exe" `
  --background --python "C:\Users\陈懒人\Desktop\Token-Cat-v0.5.0\LuluPet\model\build_cat.py"
```

## 关键参数

- 原始模型高度约 2.31（到耳尖），App 里 `targetHeight=1.45`，外层 pivot 缩放约 0.628。
- 动作：`Idle_Breathe`、`Idle_Look`、`Idle_Wiggle`、`Idle_Stretch`、`Touch_Happy`、`Eat_IceCream`、`Eat_Meal`；`Idle_Look` 里带耳尖轻抖。
- 透明窗口、点击穿透、拖拽只改窗口位置、三档尺寸和面板滚动沿用上一版 `main.js` / `app/pet.js` / `app/panel.css` 的实现。

## 已知边界

- 这是软胶手办化的卡通猫，不是写实毛发级；手指/脚趾仍是三瓣简化造型。
- 无耳内绒毛、舌头和开合嘴腔；吃东西靠道具和头部动作表现。
- 后续要改毛色/花纹，直接改 `build_cat.py` 的 `FUR` / `ORANGE` / 顶点色条件；要改体型改 `body_sections`。
