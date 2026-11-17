const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'Token-Cat');
const DEFAULT_SETTINGS = {
  budget: { currency: 'CNY', dailyLimit: 10 },
  pricing: { inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5 },
  contextWindow: 131072
};

function readSettings(settingsPath) {
  const file = settingsPath || path.join(__dirname, 'config', 'settings.json');
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (stored && stored.budget) Object.assign(settings.budget, stored.budget);
    if (stored && stored.pricing) Object.assign(settings.pricing, stored.pricing);
    if (stored && Number(stored.contextWindow) > 0) settings.contextWindow = Number(stored.contextWindow);
  } catch {}
  return settings;
}

function dayKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeUsage(usage) {
  const prompt = toInt(usage && (usage.prompt_tokens ?? usage.input_tokens));
  const completion = toInt(usage && (usage.completion_tokens ?? usage.output_tokens));
  const cached = toInt(usage && (usage.cached_input_tokens
    ?? (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens)));
  const reasoning = toInt(usage && (usage.reasoning_tokens
    ?? (usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens)));
  const total = toInt(usage && usage.total_tokens) || prompt + completion;
  return { prompt, completion, cached, reasoning, total };
}

function costFor(usage, pricing) {
  const billableInput = Math.max(0, usage.prompt - usage.cached);
  const inputCost = billableInput * Number(pricing.inputPerMillion || 0);
  const cachedCost = usage.cached * Number(pricing.cachedInputPerMillion || 0);
  const outputCost = usage.completion * Number(pricing.outputPerMillion || 0);
  return (inputCost + cachedCost + outputCost) / 1000000;
}

function loadLedger(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && Array.isArray(data.entries)) {
      return { version: 1, entries: data.entries.filter((entry) => entry && Number(entry.totalTokens) > 0) };
    }
  } catch {}
  return { version: 1, entries: [] };
}

function saveLedger(file, ledger) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  const text = JSON.stringify(ledger, null, 2);
  try {
    fs.writeFileSync(temp, text, 'utf8');
    try {
      fs.renameSync(temp, file);
    } catch {
      // Windows may refuse replacing an existing file; write directly as fallback.
      fs.writeFileSync(file, text, 'utf8');
      try { fs.unlinkSync(temp); } catch {}
    }
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function createUsageTracker(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const settingsPath = options.settingsPath || path.join(__dirname, 'config', 'settings.json');
  const ledgerPath = path.join(dataDir, 'usage-ledger.json');
  const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionStartedAt = new Date().toISOString();
  let ledger = loadLedger(ledgerPath);

  function snapshot() {
    const settings = readSettings(settingsPath);
    const pricing = settings.pricing;
    const now = new Date();
    const today = dayKey(now);
    const todayEntries = ledger.entries.filter((entry) => entry.day === today);
    const sessionEntries = ledger.entries.filter((entry) => entry.sessionId === sessionId);
    const todayTokens = todayEntries.reduce((sum, entry) => sum + toInt(entry.totalTokens), 0);
    const todayCost = todayEntries.reduce((sum, entry) => sum + Number(entry.cost || 0), 0);
    const sessionTokens = sessionEntries.reduce((sum, entry) => sum + toInt(entry.totalTokens), 0);
    const sessionCost = sessionEntries.reduce((sum, entry) => sum + Number(entry.cost || 0), 0);
    const last = ledger.entries[ledger.entries.length - 1] || null;
    const contextWindow = Number(settings.contextWindow || 0);
    const lastInput = last ? toInt(last.promptTokens) : 0;
    const contextPercent = contextWindow > 0 ? Math.min(100, (lastInput / contextWindow) * 100) : 0;
    const dailyLimit = Number(settings.budget.dailyLimit || 10);
    const budgetRemaining = Math.max(0, dailyLimit - todayCost);
    const recentEntries = ledger.entries.slice(-8).reverse().map((entry) => ({
      id: entry.id,
      at: entry.at,
      day: entry.day,
      model: entry.model || '',
      source: entry.source || '',
      promptTokens: toInt(entry.promptTokens),
      completionTokens: toInt(entry.completionTokens),
      totalTokens: toInt(entry.totalTokens),
      cost: Number(entry.cost || 0)
    }));

    return {
      ok: todayEntries.length > 0,
      totalTokens: todayTokens,
      sessionTokens,
      todayTokens,
      inputTokens: todayEntries.reduce((sum, entry) => sum + toInt(entry.promptTokens), 0),
      outputTokens: todayEntries.reduce((sum, entry) => sum + toInt(entry.completionTokens), 0),
      cachedTokens: todayEntries.reduce((sum, entry) => sum + toInt(entry.cachedTokens), 0),
      reasoningTokens: todayEntries.reduce((sum, entry) => sum + toInt(entry.reasoningTokens), 0),
      cost: todayCost,
      sessionCost,
      todayCost,
      budgetRemaining,
      contextPercent,
      contextRemaining: Math.max(0, contextWindow - lastInput),
      contextWindow,
      source: last
        ? `${last.model || '模型'} · 本次 App 对话`
        : '本次 App 对话',
      lastModel: last ? last.model || '' : '',
      updatedAt: last ? last.at : now.toISOString(),
      currency: settings.budget.currency || 'CNY',
      dailyLimit,
      accountBalance: null,
      accountBalanceAvailable: false,
      accountBalanceNote: 'OpenCSG 账户余额接口未接入',
      settings,
      sessionId,
      sessionStartedAt,
      ledgerPath,
      recentEntries
    };
  }

  function recordChat({ usage, model, source = 'app-chat' } = {}) {
    const normalized = normalizeUsage(usage);
    if (normalized.total <= 0) return { recorded: false, state: snapshot() };
    const settings = readSettings(settingsPath);
    const at = new Date();
    const entry = {
      id: `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: at.toISOString(),
      day: dayKey(at),
      sessionId,
      model: String(model || '').slice(0, 80),
      source: String(source || 'app-chat').slice(0, 80),
      promptTokens: normalized.prompt,
      completionTokens: normalized.completion,
      cachedTokens: normalized.cached,
      reasoningTokens: normalized.reasoning,
      totalTokens: normalized.total,
      cost: costFor(normalized, settings.pricing)
    };
    ledger.entries.push(entry);
    if (ledger.entries.length > 5000) ledger.entries.splice(0, ledger.entries.length - 5000);
    saveLedger(ledgerPath, ledger);
    return { recorded: true, entry, state: snapshot() };
  }

  return { recordChat, snapshot, sessionId, ledgerPath, settingsPath };
}

module.exports = { createUsageTracker, readSettings, dayKey, root };
