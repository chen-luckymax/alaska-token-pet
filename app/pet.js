import * as THREE from './three.module.js';
import { GLTFLoader } from './GLTFLoader.js';

const api = window.petAPI || {
  hitTest() {}, dragStart() {}, dragMove() {}, dragEnd() {}, openPanel() {}, openChat() {},
  getState() {}, onState() {}, onPanelTab() {}, onDemoFeed() {}, resizePet() {}, quit() {}
};

const canvas = document.getElementById('scene');
const bubble = document.getElementById('bubble');
const bubbleTitle = document.getElementById('bubbleTitle');
const bubbleText = document.getElementById('bubbleText');
const heartsLayer = document.getElementById('hearts');
const hud = document.getElementById('hud');
const hudTokens = document.getElementById('hudTokens');
const hudBudget = document.getElementById('hudBudget');
const hudMeta = document.getElementById('hudMeta');
const hint = document.getElementById('hint');
const loading = document.getElementById('loading');

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1.02, 5.80);
camera.lookAt(0, 0.92, 0);

const root = new THREE.Group();
root.rotation.y = -0.10;
scene.add(root);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xFFFEF8, 0xC8B8A6, 1.16));

const key = new THREE.DirectionalLight(0xFFFDF6, 2.18);
key.position.set(-3.4, 5.4, 4.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3.4;
key.shadow.camera.right = 3.4;
key.shadow.camera.top = 4.2;
key.shadow.camera.bottom = -1.6;
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 18;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);

const fill = new THREE.DirectionalLight(0xE3EEFF, 0.72);
fill.position.set(3.8, 3.2, 3.4);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xFFF2E2, 1.05);
rim.position.set(0.8, 4.4, -4.8);
scene.add(rim);

const bounce = new THREE.PointLight(0xFFD6B0, 0.32, 6, 2);
bounce.position.set(0, 0.55, 3.2);
scene.add(bounce);

// No textured shadow plane at all: transparent desktop stays clean, with no
// rectangle or grey smear behind the pet.

// ---------- character ----------
const pickables = [];
const actions = {};
let mixer = null;
let current = null;
let currentName = '';
let oneShot = false;
let feedActive = false;
let food = null;
let foodTier = '';
let feedElapsed = 0;
let idleTimer = 0;
const crumbs = [];
let lastCrumb = 0;

const loader = new GLTFLoader();
loader.load('./assets/lulu.glb', (gltf) => {
  const model = gltf.scene;
  let box = new THREE.Box3().setFromObject(model);
  const rawSize = box.getSize(new THREE.Vector3());
  const targetHeight = 1.45;
  const scale = targetHeight / Math.max(0.001, rawSize.y);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  // Scale a wrapper, not gltf.scene itself: the animation clips also key the
  // armature's own scale, which would otherwise undo the fit at frame 0.
  const pivot = new THREE.Group();
  pivot.scale.setScalar(scale);
  pivot.add(model);
  root.add(pivot);
  box = new THREE.Box3().setFromObject(pivot);
  console.log('[lulu] scaled height', box.getSize(new THREE.Vector3()).y.toFixed(3), 'scale', scale.toFixed(3));

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    object.frustumCulled = false;
    if (object.material) {
      object.material.envMapIntensity = 0.6;
      // Keep the authored double-sided shorts surface readable from both sides.
      if (Array.isArray(object.material)) {
        object.material.forEach((m) => { m.envMapIntensity = 0.6; });
      }
    }
    pickables.push(object);
  });

  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    actions[clip.name] = action;
  }
  mixer.addEventListener('finished', (event) => {
    if (event.action !== current || !oneShot) return;
    oneShot = false;
    if (feedActive) {
      feedActive = false;
      clearFood();
    }
    playIdle(true);
  });

  loading.classList.add('hide');
  setTimeout(() => { if (loading.parentNode) loading.parentNode.removeChild(loading); }, 380);
  playIdle(true);
  api.getState();
  setTimeout(() => showBubble('阿拉斯加说', '双击我，看看钱包和 token。', 2400), 1300);
  setTimeout(() => hint.classList.add('hide'), 8500);

  const query = new URLSearchParams(window.location.search);
  const demo = query.get('demo');
  if (demo) setTimeout(() => startFeed(demo), 1200);
}, undefined, (error) => {
  console.error('GLB load failed', error);
  if (loading) {
    loading.textContent = '阿拉斯加加载失败，请检查 lulu.glb';
    loading.classList.remove('hide');
  }
});

// ---------- props ----------
const propMat = {
  cone: new THREE.MeshPhysicalMaterial({ color: 0xD8A05A, roughness: 0.72 }),
  cream: new THREE.MeshPhysicalMaterial({ color: 0xFFF4DA, roughness: 0.46, clearcoat: 0.25 }),
  pink: new THREE.MeshPhysicalMaterial({ color: 0xF5A7B4, roughness: 0.5, clearcoat: 0.25 }),
  choco: new THREE.MeshPhysicalMaterial({ color: 0x6A3A26, roughness: 0.55 }),
  cherry: new THREE.MeshPhysicalMaterial({ color: 0xD94242, roughness: 0.3, clearcoat: 0.6 }),
  bowl: new THREE.MeshPhysicalMaterial({ color: 0xE8BE96, roughness: 0.42, clearcoat: 0.2 }),
  bowlDark: new THREE.MeshPhysicalMaterial({ color: 0xC99368, roughness: 0.52 }),
  rice: new THREE.MeshPhysicalMaterial({ color: 0xFFFBF0, roughness: 0.7 }),
  fruit: new THREE.MeshPhysicalMaterial({ color: 0xF08A52, roughness: 0.55 }),
  green: new THREE.MeshPhysicalMaterial({ color: 0x8EC466, roughness: 0.55 }),
};

function makeIceCream(doubleScoop) {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.30, 20), propMat.cone);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.15;
  cone.castShadow = true;
  group.add(cone);

  const scoop1 = new THREE.Mesh(new THREE.SphereGeometry(0.125, 22, 16), propMat.pink);
  scoop1.scale.set(1.0, 0.88, 1.0);
  scoop1.position.y = 0.34;
  scoop1.castShadow = true;
  group.add(scoop1);

  let scoop2 = null;
  if (doubleScoop) {
    scoop2 = new THREE.Mesh(new THREE.SphereGeometry(0.115, 22, 16), propMat.cream);
    scoop2.scale.set(1.0, 0.88, 1.0);
    scoop2.position.y = 0.46;
    scoop2.castShadow = true;
    group.add(scoop2);
  }

  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), propMat.cherry);
  cherry.position.set(0, doubleScoop ? 0.56 : 0.46, 0.0);
  cherry.castShadow = true;
  group.add(cherry);
  group.userData.scoop1 = scoop1;
  group.userData.scoop2 = doubleScoop ? scoop2 : null;
  group.userData.cherry = cherry;
  group.userData.biteBase = {
    scoop1: scoop1.scale.clone(),
    scoop2: doubleScoop ? scoop2.scale.clone() : null,
    cherry: cherry.scale.clone(),
  };
  group.userData.baseY = 0.72;
  return group;
}

function makeBowl(fruitBowl) {
  const group = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.155, 0.14, 28, 1, true), propMat.bowl);
  bowl.position.y = 0.07;
  bowl.castShadow = true;
  group.add(bowl);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.155, 28), propMat.bowlDark);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.0001;
  group.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.222, 0.016, 10, 30), propMat.bowlDark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.14;
  group.add(rim);

  if (fruitBowl) {
    const colors = [propMat.fruit, propMat.green, propMat.pink];
    const fruits = [];
    for (let i = 0; i < 7; i += 1) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.060 + (i % 3) * 0.008, 12, 9), colors[i % colors.length]);
      const angle = i * 1.7;
      fruit.position.set(Math.cos(angle) * 0.085, 0.18 + (i % 3) * 0.012, Math.sin(angle) * 0.070);
      fruit.castShadow = true;
      group.add(fruit);
      fruits.push(fruit);
    }
    group.userData.fruits = fruits;
  } else {
    const rice = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), propMat.rice);
    rice.scale.set(1.0, 0.58, 1.0);
    rice.position.y = 0.17;
    rice.castShadow = true;
    group.add(rice);
    group.userData.rice = rice;
  }
  group.userData.baseY = 0.30;
  return group;
}

function clearFood() {
  if (!food) return;
  root.remove(food);
  food.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
  });
  food = null;
}

function showFood(tier) {
  clearFood();
  if (tier === 'meal') {
    food = makeBowl(false);
  } else if (tier === 'watermelon') {
    food = makeBowl(true);
  } else if (tier === 'cookie') {
    food = makeIceCream(true);
  } else {
    food = makeIceCream(false);
  }
  foodTier = tier;
  food.visible = true;
  food.position.set(0, food.userData.baseY, 0.86);
  food.rotation.y = 0.2;
  food.scale.setScalar(0.72);
  root.add(food);
}

function spawnCrumbs() {
  if (!food || crumbs.length > 28) return;
  const palette = foodTier === 'meal'
    ? [0xFFFBF0, 0xF7E7C6, 0xE7B56F]
    : foodTier === 'watermelon'
      ? [0xF08A52, 0x8EC466, 0xD94242]
      : [0xFFF4DA, 0xF5A7B4, 0xD8A05A];
  for (let i = 0; i < 4; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true });
    const bit = new THREE.Mesh(new THREE.SphereGeometry(0.012 + Math.random() * 0.010, 6, 5), mat);
    bit.position.set(
      food.position.x + (Math.random() - 0.5) * 0.16,
      food.position.y + (Math.random() - 0.35) * 0.09,
      food.position.z + (Math.random() - 0.5) * 0.13,
    );
    bit.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.20, Math.random() * 0.13 + 0.02, (Math.random() - 0.5) * 0.20);
    bit.userData.life = 0.9 + Math.random() * 0.35;
    bit.userData.age = 0;
    root.add(bit);
    crumbs.push(bit);
  }
}

function updateCrumbs(dt) {
  for (let i = crumbs.length - 1; i >= 0; i -= 1) {
    const bit = crumbs[i];
    bit.userData.age += dt;
    bit.userData.vel.y -= 0.85 * dt;
    bit.position.addScaledVector(bit.userData.vel, dt);
    const left = 1 - bit.userData.age / bit.userData.life;
    bit.scale.setScalar(Math.max(0.01, left));
    if (bit.userData.age >= bit.userData.life) {
      root.remove(bit);
      bit.geometry.dispose();
      bit.material.dispose();
      crumbs.splice(i, 1);
    }
  }
}

function updateFood(dt) {
  if (!food || !feedActive) return;
  feedElapsed += dt;
  const p = Math.min(1, feedElapsed / 1.1);
  const lift = 1 - Math.pow(1 - p, 3);
  const bob = Math.sin(feedElapsed * 7.5) * 0.018 * Math.min(1, feedElapsed * 2.5);
  const targetY = (foodTier === 'meal' || foodTier === 'watermelon' ? 0.50 : 0.74) + bob;
  const targetZ = 0.42;
  food.position.y = THREE.MathUtils.lerp(food.userData.baseY, targetY, lift);
  food.position.z = THREE.MathUtils.lerp(0.86, targetZ, lift);
  food.rotation.y += dt * 0.28;
  if (foodTier === 'cookie' || foodTier === 'icecream') {
    food.rotation.z = 0.18 + Math.sin(feedElapsed * 3.4) * 0.05;
  }

  // Bite/lick progress: the prop visibly loses volume as the cat eats.
  const biteP = THREE.MathUtils.clamp((feedElapsed - 0.9) / 2.25, 0, 1);
  const { scoop1, scoop2, cherry, rice, fruits, biteBase } = food.userData;
  if (scoop1 && biteBase) {
    scoop1.scale.set(
      biteBase.scoop1.x * (1 - 0.34 * biteP),
      biteBase.scoop1.y * (1 - 0.40 * biteP),
      biteBase.scoop1.z * (1 - 0.34 * biteP),
    );
  }
  if (scoop2 && biteBase && biteBase.scoop2) {
    scoop2.scale.set(
      biteBase.scoop2.x * (1 - 0.30 * biteP),
      biteBase.scoop2.y * (1 - 0.34 * biteP),
      biteBase.scoop2.z * (1 - 0.30 * biteP),
    );
  }
  if (cherry && biteBase) {
    cherry.scale.setScalar(1 - 0.55 * biteP);
  }
  if (rice) {
    rice.scale.set(1.0, 0.58 - 0.36 * biteP, 1.0);
    rice.position.y = 0.17 - 0.045 * biteP;
  }
  if (fruits) {
    fruits.forEach((fruit, i) => {
      const eaten = biteP * fruits.length > i + 1.5;
      const target = eaten ? 0.25 : 1.0;
      fruit.scale.lerp(new THREE.Vector3(target, target, target), 0.10);
    });
  }

  if (feedElapsed > 1.0 && feedElapsed - lastCrumb > 0.26) {
    lastCrumb = feedElapsed;
    spawnCrumbs();
  }
}

// ---------- animation ----------
const IDLES = ['Idle_Breathe', 'Idle_Look', 'Idle_Wiggle', 'Idle_Stretch', 'Idle_Yawn'];
let idleIndex = 0;

function playAction(name, once, fade = 0.35) {
  const next = actions[name];
  if (!next) return false;
  if (current && current !== next) current.fadeOut(fade);
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.fadeIn(fade).play();
  current = next;
  currentName = name;
  oneShot = once;
  return true;
}

function playIdle(force = false) {
  if (!mixer) return;
  if (feedActive) return;
  if (!force && oneShot) return;
  const name = IDLES[idleIndex % IDLES.length];
  idleIndex = (idleIndex + 1) % IDLES.length;
  playAction(name, false, 0.55);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => playIdle(false), 6200 + Math.random() * 2600);
}

function touchReaction(zone) {
  if (!mixer || feedActive) return;
  playAction('Touch_Happy', true, 0.25);
  const title = '阿拉斯加说';
  const lines = zone === 'tail'
    ? ['尾巴不能拽，会炸毛。', '尾巴是限量款，摸一下就好。', '再拽我就变成抽象画了。']
    : [
        '摸摸头可以，别摸走我的 token。',
        '今天又花了不少 token 哦。',
        '冰激凌和饭，你选一个。',
        '我不是胖，是软。',
        '再摸一下，我就原谅你。',
        '我在呢，没睡着。',
        '你可以双击我，看看钱包。'
      ];
  const text = lines[Math.floor(Math.random() * lines.length)];
  showBubble(title, text, 1900);
}

function startFeed(tier) {
  if (!mixer || feedActive) return;
  const normalized = ['icecream', 'cookie', 'watermelon', 'meal'].includes(tier) ? tier : 'icecream';
  feedActive = true;
  oneShot = true;
  feedElapsed = 0;
  lastCrumb = 0;
  showFood(normalized);
  const clip = normalized === 'meal' || normalized === 'watermelon' ? 'Eat_Meal' : 'Eat_IceCream';
  playAction(clip, true, 0.3);
  showBubble('阿拉斯加说', normalized === 'meal' || normalized === 'watermelon' ? '开饭啦，慢慢吃。' : '冰激凌，先舔一口。', 1900);
  const duration = (actions[clip] && actions[clip].getClip().duration) || 3.7;
  // Keep the prop visible while the clip runs; the finished event returns to idle.
  setTimeout(() => {
    if (!feedActive) return;
    feedActive = false;
    oneShot = false;
    clearFood();
    playIdle(true);
  }, duration * 1000 + 300);
}

// ---------- UI ----------
let bubbleTimer = 0;
let hudTimer = 0;
let hadState = false;
let lastState = null;

function showBubble(title, text, ms = 1800) {
  if (!bubble) return;
  if (bubbleTitle) bubbleTitle.textContent = title || '阿拉斯加说';
  if (bubbleText) bubbleText.textContent = text || '';
  bubble.classList.remove('show');
  void bubble.offsetWidth;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
}

function showHud() {
  if (!hud) return;
  console.log('[lulu] show hud');
  hud.classList.remove('show');
  void hud.offsetWidth;
  hud.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { console.log('[lulu] hide hud'); hud.classList.remove('show'); }, 5600);
}

function fmtTokens(n) {
  const value = Number(n || 0);
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function spawnHearts(clientX, clientY) {
  if (!heartsLayer) return;
  const count = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'heart';
    el.textContent = '♥';
    el.style.left = `${clientX + (Math.random() - 0.5) * 28}px`;
    el.style.top = `${clientY + (Math.random() - 0.5) * 10}px`;
    el.style.animationDelay = `${i * 0.055}s`;
    el.style.fontSize = `${12 + Math.random() * 5}px`;
    heartsLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

api.onState((state) => {
  lastState = state;
  if (!state) return;
  const tokens = Number(state.totalTokens || 0);
  if (hudTokens) hudTokens.textContent = `${fmtTokens(tokens)} tok`;
  const budget = Number(state.budgetRemaining || 0);
  if (hudBudget) hudBudget.textContent = `¥${budget.toFixed(2)}`;
  if (hudMeta) hudMeta.textContent = state.ok ? '本次会话' : '等待会话';
  if (!hadState || Number(state.delta) > 0) showHud();
  if (hadState && Number(state.delta) > 0) {
    const delta = Number(state.delta);
    const tier = delta >= 100000 ? 'meal' : delta >= 20000 ? 'watermelon' : delta >= 5000 ? 'cookie' : 'icecream';
    startFeed(tier);
  }
  hadState = true;
});

api.onDemoFeed((tier) => startFeed(tier));

// ---------- interaction ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragCandidate = false;
let dragStarted = false;
let downPoint = { x: 0, y: 0 };
let lastHitSent = null;
let clickTimer = 0;

function syncHit(hit) {
  if (hit === lastHitSent) return;
  lastHitSent = hit;
  api.hitTest(hit);
}

function pickAt(clientX, clientY) {
  if (pickables.length === 0) return null;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return null;
  return hits[0].object.userData.zone || 'body';
}

function pointerPos(event) {
  return { x: Number(event.screenX || 0), y: Number(event.screenY || 0) };
}

canvas.addEventListener('pointermove', (event) => {
  if (dragStarted) return;
  const zone = pickAt(event.clientX, event.clientY);
  canvas.classList.toggle('active', !!zone);
  syncHit(!!zone);
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const zone = pickAt(event.clientX, event.clientY);
  if (!zone) { syncHit(false); return; }
  downPoint = pointerPos(event);
  dragCandidate = true;
  dragStarted = false;
  syncHit(true);
  try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
});

canvas.addEventListener('pointerup', (event) => {
  try { canvas.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
  const wasDragging = dragStarted;
  dragStarted = false;
  dragCandidate = false;
  api.dragEnd();

  if (wasDragging) {
    syncHit(!!pickAt(event.clientX, event.clientY));
    return;
  }

  const zone = pickAt(event.clientX, event.clientY);
  if (!zone) { syncHit(false); return; }
  syncHit(true);
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = 0;
    api.openPanel('balance');
    showBubble('钱包', 'token 与余额已打开。', 1400);
    return;
  }
  clickTimer = setTimeout(() => {
    clickTimer = 0;
    touchReaction(zone);
    spawnHearts(event.clientX, event.clientY);
  }, 260);
});

canvas.addEventListener('pointerleave', () => {
  if (!dragStarted) syncHit(false);
  canvas.classList.remove('active');
});

window.addEventListener('pointermove', (event) => {
  if (!dragCandidate || dragStarted) return;
  const dx = event.screenX - downPoint.x;
  const dy = event.screenY - downPoint.y;
  if (Math.hypot(dx, dy) > 4) {
    dragStarted = true;
    document.body.classList.add('dragging');
    api.dragStart(downPoint);
    api.dragMove(pointerPos(event));
  }
});

window.addEventListener('pointermove', (event) => {
  if (!dragStarted) return;
  api.dragMove(pointerPos(event));
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.openPanel('balance');
});

// ---------- resize / loop ----------
function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let elapsed = 0;
function tick() {
  const dt = Math.min(0.05, clock.getDelta() || 0.016);
  elapsed += dt;
  if (mixer) mixer.update(dt);
  updateFood(dt);
  updateCrumbs(dt);

  // A very small breathing drift keeps the pet alive even between clips.
  if (root) {
    root.position.y = Math.sin(elapsed * 0.9) * 0.004;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

syncHit(false);
api.hitTest(false);
requestAnimationFrame(tick);
