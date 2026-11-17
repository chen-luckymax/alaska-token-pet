const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..', 'Token-Cat');
const settingsPath = path.join(root, 'config', 'settings.json');

function readSettings() {
  const defaults = {
    budget: { currency: 'CNY', initialBalance: 50, dailyLimit: 10 },
    pricing: { inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5 }
  };
  try {
    return Object.assign(defaults, JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  } catch {
    return defaults;
  }
}

function walkJsonl(dir, depth = 0, out = []) {
  if (depth > 5) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) walkJsonl(full, depth + 1, out);
      else if (entry.name.toLowerCase().endsWith('.jsonl')) out.push(full);
    } catch {}
  }
  return out;
}

function findSessionFiles() {
  const roots = [
    path.join(os.homedir(), '.csgclaw', 'agents'),
    path.join(os.homedir(), '.codex', 'sessions')
  ];
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return roots.flatMap((dir) => walkJsonl(dir))
    .map((file) => {
      try { return { file, mtime: fs.statSync(file).mtimeMs }; } catch { return null; }
    })
    .filter((item) => item && item.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
}

function readLatestUsage() {
  const settings = readSettings();
  const files = findSessionFiles();
  const latest = files[0];
  if (!latest) {
    return {
      ok: false,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
      budgetRemaining: settings.budget.dailyLimit,
      contextPercent: 0,
      contextRemaining: 0,
      contextWindow: 0,
      source: '等待 Codex / CSG 会话',
      updatedAt: new Date().toISOString()
    };
  }

  let text = '';
  try { text = fs.readFileSync(latest.file, 'utf8'); } catch {}
  let usage = null;
  let contextWindow = 0;
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.includes('token_count')) continue;
    try {
      const item = JSON.parse(line);
      const info = item && item.payload && item.payload.info;
      if (info && info.total_token_usage) {
        usage = info;
        contextWindow = Number(info.model_context_window || 0);
        break;
      }
    } catch {}
  }

  const total = usage ? usage.total_token_usage : { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, total_tokens: 0 };
  const input = Number(total.input_tokens || 0);
  const output = Number(total.output_tokens || 0);
  const cached = Number(total.cached_input_tokens || 0);
  const totalTokens = Number(total.total_tokens || input + output);
  const pricing = settings.pricing;
  const cost = ((input - cached) * Number(pricing.inputPerMillion || 0)
    + cached * Number(pricing.cachedInputPerMillion || 0)
    + output * Number(pricing.outputPerMillion || 0)) / 1000000;
  const last = usage && usage.last_token_usage ? usage.last_token_usage : {};
  const contextInput = Number(last.input_tokens || 0);
  const contextPercent = contextWindow > 0 ? Math.min(100, (contextInput / contextWindow) * 100) : 0;

  return {
    ok: true,
    totalTokens,
    inputTokens: input,
    outputTokens: output,
    cachedTokens: cached,
    cost,
    budgetRemaining: Math.max(0, Number(settings.budget.dailyLimit || 10) - cost),
    contextPercent,
    contextRemaining: Math.max(0, contextWindow - contextInput),
    contextWindow,
    source: path.basename(latest.file),
    sessionPath: latest.file,
    updatedAt: new Date().toISOString(),
    currency: settings.budget.currency || 'CNY'
  };
}

module.exports = { readLatestUsage, readSettings, root };
