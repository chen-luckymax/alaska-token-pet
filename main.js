const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const { createUsageTracker, root } = require('./usage');

// 终端/启动器关闭后 stdout 会变成断管，console.log 在异步回调里抛 EPIPE
// 会触发 Electron 的“主进程 JavaScript 错误”弹窗。日志写失败只应丢弃，不应影响桌宠。
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
function isBrokenPipe(error) {
  return Boolean(error && (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED'));
}
function safeLog(...args) {
  try { originalConsoleLog(...args); } catch (error) { if (!isBrokenPipe(error)) throw error; }
}
function safeError(...args) {
  try { originalConsoleError(...args); } catch (error) { if (!isBrokenPipe(error)) throw error; }
}
process.stdout.on('error', (error) => { if (!isBrokenPipe(error)) throw error; });
process.stderr.on('error', (error) => { if (!isBrokenPipe(error)) throw error; });

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let petWindow = null;
let panelWindow = null;
let tray = null;
let appServer = null;
let appPort = 0;
let lastTotal = null;
let lastUsage = null;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let dragLock = null;
let stateTimer = null;
let balanceTimer = null;
let appQuitting = false;
let usageTracker = null;
let panelDismissed = false;
let panelWatchdog = null;

const PET_SIZES = {
  small: { width: 150, height: 198 },
  medium: { width: 190, height: 250 },
  large: { width: 240, height: 316 }
};
const sizeArg = process.argv.find((arg) => arg.startsWith('--size='));
let petSize = sizeArg && PET_SIZES[sizeArg.split('=')[1]] ? sizeArg.split('=')[1] : 'small';function petDims() {
  return PET_SIZES[petSize] || PET_SIZES.small;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

function startAppServer() {
  return new Promise((resolve, reject) => {
    const appDir = path.join(__dirname, 'app');
    safeLog('[pet] serving', appDir);
    appServer = http.createServer((req, res) => {
      let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (pathname === '/') pathname = '/index.html';
      const file = path.normalize(path.join(appDir, pathname));
      if (!file.startsWith(appDir)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      fs.readFile(file, (error, data) => {
        if (error) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(data);
      });
    });
    appServer.on('error', reject);
    appServer.listen(0, '127.0.0.1', () => {
      appPort = appServer.address().port;
      resolve(appPort);
    });
  });
}

function clampToWorkArea(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  return {
    x: Math.round(Math.max(area.x, Math.min(area.x + area.width - w, x))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - h, y)))
  };
}

function positionPet(sizeKey) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const dims = sizeKey && PET_SIZES[sizeKey] ? PET_SIZES[sizeKey] : petDims();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const x = area.x + Math.round(area.width * 0.50) - Math.round(dims.width / 2);
  const y = area.y + area.height - dims.height - 90;
  safeLog(`[pet] position target ${x},${y} area ${JSON.stringify(area)} dims ${dims.width}x${dims.height}`);
  petWindow.setBounds({ x, y, width: dims.width, height: dims.height });
  safeLog('[pet] bounds after position', petWindow.getBounds());
  setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed()) safeLog('[pet] bounds later', petWindow.getBounds());
  }, 1200);
}

function createPetWindow() {
  const dims = petDims();
  const opaqueTest = process.argv.includes('--opaque');
  petWindow = new BrowserWindow({
    width: dims.width,
    height: dims.height,
    transparent: !opaqueTest,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: '阿拉斯加',
    backgroundColor: opaqueTest ? '#FFF9F0' : '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  petWindow.on('closed', () => { petWindow = null; });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setMinimumSize(dims.width, dims.height);
  petWindow.setMaximumSize(dims.width, dims.height);
  petWindow.on('will-resize', (event) => {
    if (dragging) event.preventDefault();
  });
  const pageName = process.argv.includes('--flat') ? 'flat.html' : 'index.html';
  const demoArg = process.argv.find((arg) => arg.startsWith('--demo='));
  const pageUrl = `http://127.0.0.1:${appPort}/${pageName}${demoArg ? `?demo=${encodeURIComponent(demoArg.split('=')[1])}` : ''}`;
  petWindow.loadURL(pageUrl);
  petWindow.setTitle('阿拉斯加');
  petWindow.on('page-title-updated', (event) => event.preventDefault());
  safeLog('[pet] window', petWindow.getBounds(), 'url', pageUrl);
  petWindow.webContents.on('console-message', (_event, level, message) => {
    safeLog(`[pet:${level}] ${message}`);
  });
  petWindow.webContents.on('did-fail-load', (_event, code, desc) => {
    safeError(`pet load failed: ${code} ${desc}`);
  });
  petWindow.webContents.on('did-finish-load', () => {
    safeLog('pet page loaded');
    if (!petWindow.isVisible()) petWindow.show();
    if (process.argv.includes('--test-dblclick')) {
      setTimeout(() => {
        if (!petWindow || petWindow.isDestroyed()) return;
        const b = petWindow.getBounds();
        const x = Math.round(b.width / 2);
        const y = Math.round(b.height * 0.62);
        const click = (type) => petWindow.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
        click('mouseDown'); click('mouseUp');
        setTimeout(() => { click('mouseDown'); click('mouseUp'); safeLog('[pet] test double click sent'); }, 110);
      }, 1800);
    }
    if (process.argv.includes('--test-panel')) {
      setTimeout(() => { if (!panelWindow || panelWindow.isDestroyed()) createPanelWindow(); }, 1000);
    }
    if (process.env.LULU_SNAPSHOT === '1' || process.argv.some((arg) => arg.startsWith('--snapshot'))) {
      const delayArg = process.argv.find((arg) => arg.startsWith('--snapshot-delay='));
      const delay = Number(process.env.LULU_SNAPSHOT_DELAY) || (delayArg ? Number(delayArg.split('=')[1]) : 4500);
      setTimeout(async () => {
        try {
          const image = await petWindow.webContents.capturePage();
          fs.writeFileSync(path.join(__dirname, 'snapshot-electron.png'), image.toPNG());
          safeLog('snapshot saved');
        } catch (error) {
          safeError('snapshot failed', error);
        }
        app.quit();
      }, delay);
    }
  });
  petWindow.once('ready-to-show', () => {
    positionPet();
    petWindow.show();
    // Transparent pixels must not block the desktop. Forwarded mouse moves let
    // the renderer detect when the cursor is over the actual pet silhouette.
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  });
  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createPanelWindow() {
  panelDismissed = false;
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show();
    panelWindow.focus();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  panelWindow = new BrowserWindow({
    width: 460,
    height: 610,
    x: Math.max(area.x + 24, (petWindow ? petWindow.getBounds().x - 476 : area.x + 24)),
    y: Math.max(area.y + 24, area.y + area.height - 634),
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: true,
    backgroundColor: '#FFF9F0',
    title: '阿拉斯加 · 钱包与对话',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panelWindow.setMenuBarVisibility(false);
  panelWindow.setAlwaysOnTop(true, 'floating');
  panelWindow.loadURL(`http://127.0.0.1:${appPort}/panel.html`);
  function revealPanel(reason) {
    if (!panelWindow || panelWindow.isDestroyed() || panelDismissed) return;
    panelWindow.show();
    panelWindow.setAlwaysOnTop(true, 'screen-saver');
    panelWindow.moveTop();
    panelWindow.focus();
    safeLog('[panel] reveal', reason, 'visible', panelWindow.isVisible());
  }
  panelWindow.once('ready-to-show', () => {
    revealPanel('ready-to-show');
  });
  panelWindow.webContents.once('did-finish-load', () => {
    revealPanel('did-finish-load');
  });
  // Some Windows/Electron combinations create the BrowserWindow but leave it
  // hidden even after show(); reveal again after the first paint and after load.
  panelWindow.show();
  panelWindow.focus();
  setTimeout(() => revealPanel('frame-1'), 300);
  setTimeout(() => revealPanel('frame-2'), 1200);
  panelWindow.on('hide', () => safeLog('[panel] hide'));
  panelWindow.on('minimize', () => safeLog('[panel] minimize'));
  panelWindow.on('close', (event) => {
    if (!appQuitting) {
      event.preventDefault();
      panelDismissed = true;
      panelWindow.hide();
    }
  });
  panelWindow.on('closed', () => { safeLog('[panel] closed'); panelWindow = null; });
}

function openLegacyChat() {
  const script = path.join(root, 'src', 'Open-Chat.ps1');
  try {
    spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-STA', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Root', root],
      { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
  } catch (error) {
    safeError('chat launch failed', error);
  }
}

// Optional local .env. The file is never committed; values are only read at runtime.
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const value = match[2].replace(/^['"]|['"]$/g, '');
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch (error) {
    safeError('env load failed', error);
  }
}
loadEnvFile();

function chatUrl(base) {
  const raw = String(base || '').replace(/\/+$/, '');
  if (!raw) return '';
  return /\/chat\/completions$/i.test(raw) ? raw : `${raw}/chat/completions`;
}

function providerInfo() {
  const hint = String(process.env.LLM_PROVIDER || '').toLowerCase();
  const base = String(process.env.LLM_API_URL || '').toLowerCase();
  if (hint.includes('deepseek') || base.includes('deepseek')) {
    return { id: 'deepseek', label: 'DeepSeek' };
  }
  if (hint.includes('doubao') || hint.includes('volc') || base.includes('ark.cn-beijing.volces.com')) {
    return { id: 'doubao', label: '豆包 / 火山方舟' };
  }
  if (base.includes('opencsg')) return { id: 'opencsg', label: 'OpenCSG' };
  if (base.includes('openai.com')) return { id: 'openai', label: 'OpenAI' };
  return { id: 'compatible', label: 'OpenAI 兼容接口' };
}

let accountBalanceCache = {
  available: false,
  balance: null,
  currency: 'CNY',
  provider: '',
  note: 'OpenCSG 账户余额接口未接入'
};

async function refreshAccountBalance() {
  const config = getChatConfig();
  const provider = providerInfo();
  if (!config.baseUrl || !config.apiKey) {
    accountBalanceCache = {
      available: false,
      balance: null,
      currency: 'CNY',
      provider: provider.id,
      note: `${provider.label} 余额接口未配置`
    };
    return accountBalanceCache;
  }

  if (provider.id === 'doubao') {
    accountBalanceCache = {
      available: false,
      balance: null,
      currency: 'CNY',
      provider: provider.id,
      note: '火山方舟没有公开余额接口，请到控制台查看'
    };
    return accountBalanceCache;
  }

  if (provider.id === 'deepseek') {
    try {
      const origin = new URL(config.baseUrl).origin;
      const response = await fetch(`${origin}/user/balance`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(8000)
      });
      const data = await response.json().catch(() => null);
      const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : null;
      const balance = info && Number(info.total_balance);
      if (response.ok && data && data.is_available !== false && Number.isFinite(balance)) {
        accountBalanceCache = {
          available: true,
          balance,
          currency: info.currency || 'CNY',
          provider: provider.id,
          note: 'DeepSeek 账户总余额'
        };
      } else {
        accountBalanceCache = {
          available: false,
          balance: null,
          currency: 'CNY',
          provider: provider.id,
          note: 'DeepSeek 余额接口没有返回可用余额'
        };
      }
    } catch (error) {
      accountBalanceCache = {
        available: false,
        balance: null,
        currency: 'CNY',
        provider: provider.id,
        note: `DeepSeek 余额查询失败：${error.message}`
      };
    }
    return accountBalanceCache;
  }

  accountBalanceCache = {
    available: false,
    balance: null,
    currency: 'CNY',
    provider: provider.id,
    note: provider.id === 'opencsg'
      ? 'OpenCSG 账户余额接口未接入'
      : `${provider.label} 余额接口未接入`
  };
  return accountBalanceCache;
}

function getChatConfig() {
  return {
    baseUrl: process.env.LLM_API_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || ''
  };
}

async function probeOllama() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(1800)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function chatStatusPayload() {
  const config = getChatConfig();
  if (config.baseUrl && config.apiKey) {
    const provider = providerInfo();
    return {
      configured: true,
      mode: 'remote',
      message: `已配置 ${provider.label}：${config.model || '默认模型'}；密钥只在主进程读取。`,
      model: config.model || '',
      endpoint: config.baseUrl,
      provider: provider.id
    };
  }
  if (await probeOllama()) {
    return {
      configured: true,
      mode: 'ollama',
      message: `已连接本地 Ollama${config.model ? `：${config.model}` : '；默认模型 llama3.2'}。不联网，也不使用 API Key。`,
      model: config.model || 'llama3.2',
      endpoint: 'http://127.0.0.1:11434'
    };
  }
  return {
    configured: false,
    mode: 'none',
    message: '还没有可用模型。新建 .env 填 LLM_API_URL / LLM_API_KEY / LLM_MODEL，或启动本地 Ollama 后重试。',
    model: config.model || '',
    endpoint: config.baseUrl || ''
  };
}

async function sendChat(messages) {
  const config = getChatConfig();
  const hasRemote = Boolean(config.baseUrl && config.apiKey);
  const baseUrl = hasRemote ? config.baseUrl : 'http://127.0.0.1:11434/v1';
  const model = config.model || (hasRemote ? 'gpt-4o-mini' : 'llama3.2');
  const url = chatUrl(baseUrl);
  const body = {
    model,
    messages: messages.slice(-12),
    temperature: 0.7,
    // GLM / DeepSeek 等会先消耗一段 reasoning token；预算太小会只剩空 content。
    max_tokens: Math.max(800, Number(process.env.LLM_MAX_TOKENS) || 1200),
    stream: false
  };
  const headers = { 'Content-Type': 'application/json' };
  if (hasRemote) headers.Authorization = `Bearer ${config.apiKey}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!response.ok) {
      const detail = data && data.error && (data.error.message || data.error) || text;
      return { ok: false, error: `模型接口返回 ${response.status}：${String(detail).slice(0, 180)}` };
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return { ok: false, error: '模型返回了空内容。' };
    return {
      ok: true,
      content: String(content),
      model,
      usage: data && data.usage ? data.usage : null
    };
  } catch (error) {
    return {
      ok: false,
      error: hasRemote
        ? `连接远程模型失败：${error.message}`
        : '本地 Ollama 没连上。请先启动 Ollama，或用 .env 配置远程模型。'
    };
  }
}

function readState() {
  const usage = usageTracker ? usageTracker.snapshot() : {
    ok: false,
    totalTokens: 0,
    sessionTokens: 0,
    todayTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    cost: 0,
    sessionCost: 0,
    todayCost: 0,
    budgetRemaining: 10,
    contextPercent: 0,
    contextRemaining: 0,
    contextWindow: 0,
    source: '本次 App 对话',
    updatedAt: new Date().toISOString(),
    currency: 'CNY',
    dailyLimit: 10,
    accountBalance: null,
    accountBalanceAvailable: false,
    accountBalanceNote: 'OpenCSG 账户余额接口未接入',
    settings: { budget: { dailyLimit: 10, currency: 'CNY' } }
  };
  let delta = lastTotal === null ? 0 : Math.max(0, Number(usage.totalTokens) - lastTotal);
  if (lastTotal !== null && Number(usage.totalTokens) < lastTotal) {
    // A new local day or a reset ledger: never interpret a drop as negative usage.
    delta = 0;
  }
  const payload = Object.assign({}, usage, {
    delta,
    lastTotal,
    accountBalance: accountBalanceCache.available ? accountBalanceCache.balance : null,
    accountBalanceAvailable: Boolean(accountBalanceCache.available),
    accountBalanceCurrency: accountBalanceCache.currency || 'CNY',
    accountBalanceNote: accountBalanceCache.note,
    provider: providerInfo().id,
    providerLabel: providerInfo().label
  });
  lastTotal = Number(usage.totalTokens);
  lastUsage = payload;
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet-state', payload);
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send('pet-state', payload);
  return payload;
}

function makeTrayIcon() {
  const iconPath = path.join(__dirname, 'app', 'assets', 'tray.png');
  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    safeLog('[tray] icon', image.getSize());
    return image;
  }
  safeError('[tray] icon failed to load', iconPath);
  return nativeImage.createEmpty();
}

function buildTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('阿拉斯加 · AI token 小桌宠');
  const menu = Menu.buildFromTemplate([
    { label: '显示阿拉斯加', click: () => { if (petWindow) { petWindow.show(); petWindow.setAlwaysOnTop(true, 'screen-saver'); petWindow.moveTop(); } } },
    { label: '钱包 / 对话', click: createPanelWindow },
    { label: '打开 AI 对话', click: openLegacyChat },
    { label: '阿拉斯加大小', submenu: [
      { label: '小', click: () => applyPetSize('small') },
      { label: '中', click: () => applyPetSize('medium') },
      { label: '大', click: () => applyPetSize('large') }
    ] },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (petWindow) petWindow.show(); });
}

ipcMain.on('hit-test', (_event, hit) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  // Only the rendered pet (plus its clickable DOM overlays) should take the mouse.
  petWindow.setIgnoreMouseEvents(!hit, { forward: true });
});

ipcMain.on('drag-start', () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  dragging = true;
  petWindow.setIgnoreMouseEvents(false);
  // Use the native cursor position, not renderer screenX/screenY. This is the
  // DIP coordinate Electron positions windows in, including at 125% scaling.
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  dragLock = { width: bounds.width, height: bounds.height };
  dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
});

ipcMain.on('drag-move', () => {
  if (!petWindow || petWindow.isDestroyed() || !dragging || !dragLock) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  const next = clampToWorkArea(cursor.x - dragOffset.x, cursor.y - dragOffset.y, dragLock.width, dragLock.height);
  petWindow.setPosition(next.x, next.y, false);
  // Never let a move turn into a size change. Keep the window exactly as it
  // was when the drag began; otherwise the transparent window becomes a large
  // invisible blocker and the pet appears to grow under the cursor.
  const actual = petWindow.getBounds();
  if (actual.width !== dragLock.width || actual.height !== dragLock.height) {
    petWindow.setBounds({ x: next.x, y: next.y, width: dragLock.width, height: dragLock.height }, false);
  }
});

ipcMain.on('drag-end', () => {
  dragging = false;
  dragLock = null;
});

ipcMain.on('open-panel', (_event, tab) => {
  safeLog('[pet] open-panel', tab || 'balance');
  createPanelWindow();
  if (panelWindow) panelWindow.webContents.send('panel-tab', tab || 'balance');
});

ipcMain.on('demo-feed', (_event, tier) => {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('demo-feed', tier);
});

function applyPetSize(size) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!PET_SIZES[size]) return;
  if (dragging) return;
  petSize = size;
  const dims = petDims();
  const bounds = petWindow.getBounds();
  const next = clampToWorkArea(bounds.x, bounds.y, dims.width, dims.height);
  // Release the old min/max lock, apply the exact new size without animation,
  // then lock it again so a drag can never change the window dimensions.
  petWindow.setMinimumSize(0, 0);
  petWindow.setMaximumSize(9999, 9999);
  petWindow.setBounds({ x: next.x, y: next.y, width: dims.width, height: dims.height }, false);
  petWindow.setMinimumSize(dims.width, dims.height);
  petWindow.setMaximumSize(dims.width, dims.height);
  petWindow.webContents.send('pet-resized', dims);
}

ipcMain.on('resize-pet', (_event, size) => applyPetSize(size));

ipcMain.on('open-chat', openLegacyChat);
ipcMain.on('quit-app', () => app.quit());
ipcMain.on('panel-close', () => { panelDismissed = true; if (panelWindow) panelWindow.hide(); });
ipcMain.on('panel-minimize', () => { panelDismissed = true; if (panelWindow) panelWindow.hide(); });
ipcMain.on('get-state', () => readState());
ipcMain.on('open-external', (_event, url) => { if (url && url.startsWith('http')) shell.openExternal(url); });
ipcMain.handle('chat-status', async () => chatStatusPayload());
ipcMain.handle('chat-send', async (_event, payload) => {
  const raw = payload && Array.isArray(payload.messages) ? payload.messages : [];
  const messages = raw
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({ role: message.role, content: String(message.content || '').slice(0, 4000) }))
    .filter((message) => message.content.trim());
  if (!messages.length) return { ok: false, error: '还没有可发送的内容。' };
  const result = await sendChat(messages);
  if (result.ok && result.usage && usageTracker) {
    const recorded = usageTracker.recordChat({ usage: result.usage, model: result.model });
    result.usageRecorded = recorded.recorded;
    if (!recorded.recorded) result.usageMissing = true;
    refreshAccountBalance();
  } else if (result.ok) {
    result.usageMissing = true;
  }
  result.state = readState();
  return result;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.setAlwaysOnTop(true, 'screen-saver');
    petWindow.moveTop();
  }
});

app.whenReady().then(async () => {
  usageTracker = createUsageTracker({
    dataDir: path.join(app.getPath('userData'), 'usage')
  });
  refreshAccountBalance();
  balanceTimer = setInterval(refreshAccountBalance, 5 * 60 * 1000);
  await session.defaultSession.clearCache();
  await startAppServer();
  createPetWindow();
  buildTray();
  setTimeout(() => { readState(); }, 900);
  stateTimer = setInterval(readState, 1600);
  // Windows can hide a freshly-created frameless window without emitting 'hide'.
  // Keep an explicitly opened panel visible until the user closes it.
  panelWatchdog = setInterval(() => {
    if (!panelWindow || panelWindow.isDestroyed() || panelDismissed) return;
    if (!panelWindow.isVisible()) {
      panelWindow.show();
      panelWindow.setAlwaysOnTop(true, 'screen-saver');
      panelWindow.moveTop();
      panelWindow.focus();
    }
  }, 2500);
  app.on('activate', () => { if (!petWindow) createPetWindow(); });
}).catch((error) => {
  safeError('startup failed', error);
  app.quit();
});

app.on('before-quit', () => {
  appQuitting = true;
  if (stateTimer) clearInterval(stateTimer);
  if (balanceTimer) clearInterval(balanceTimer);
  if (panelWatchdog) clearInterval(panelWatchdog);
  if (appServer) appServer.close();
});
app.on('window-all-closed', () => { /* keep tray alive */ });
