const api = window.petAPI;
const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.tab-panel')];

function setTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${name}`));
}
tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
api.onPanelTab((tab) => setTab(tab === 'chat' ? 'chat' : 'balance'));

function fmt(n) {
  return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}
function money(n, digits) {
  const value = Number(n || 0);
  if (value === 0) return '¥0.00';
  const precision = digits !== undefined ? digits : (Math.abs(value) < 1 ? 4 : 2);
  return `¥${value.toFixed(precision).replace(/\.?0+$/, '')}`;
}
function accountMoney(n, currency) {
  const value = Number(n || 0);
  const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : `${currency || ''} `;
  return `${symbol}${value.toFixed(2).replace(/\.?0+$/, '')}`;
}

function renderRecent(state) {
  const list = document.getElementById('recentList');
  if (!list) return;
  const entries = Array.isArray(state.recentEntries) ? state.recentEntries : [];
  if (!entries.length) {
    list.innerHTML = '<p class="recent-empty">还没有记账；发一条对话后会出现本轮 tokens 和估算花费。</p>';
    return;
  }
  list.textContent = '';
  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'recent-row';
    const at = new Date(entry.at);
    const today = at.toDateString() === new Date().toDateString();
    const time = document.createElement('span');
    time.className = 'recent-time';
    time.textContent = today
      ? at.toLocaleTimeString('zh-CN', { hour12: false })
      : at.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    const main = document.createElement('span');
    main.className = 'recent-main';
    main.textContent = `${entry.model || '模型'} · ${fmt(entry.promptTokens)} → ${fmt(entry.completionTokens)}`;
    const tokens = document.createElement('span');
    tokens.className = 'recent-tokens';
    tokens.textContent = `${fmt(entry.totalTokens)} tokens`;
    const cost = document.createElement('span');
    cost.className = 'recent-cost';
    cost.textContent = money(entry.cost, 4);
    row.append(time, main, tokens, cost);
    list.appendChild(row);
  });
}

function render(state) {
  if (!state) return;
  const tokens = Number(state.totalTokens || 0);
  document.getElementById('bigTokens').textContent = fmt(tokens);
  document.getElementById('costValue').textContent = money(state.cost, 4);
  document.getElementById('budgetValue').textContent = money(state.budgetRemaining, 4);
  const limit = state.dailyLimit || (state.settings && state.settings.budget ? state.settings.budget.dailyLimit : 10);
  document.getElementById('budgetHint').textContent = `上限 ${money(limit)} · 本地预算，不是账户余额`;
  document.getElementById('accountBalance').textContent = state.accountBalanceAvailable
    ? accountMoney(state.accountBalance, state.accountBalanceCurrency)
    : '未接入';
  document.getElementById('accountBalanceNote').textContent = state.accountBalanceAvailable
    ? (state.accountBalanceNote || '账户总余额')
    : (state.accountBalanceNote || 'OpenCSG 余额接口暂未配置');
  document.getElementById('sourceLine').textContent = state.ok
    ? `${state.source} · 本次会话 ${fmt(state.sessionTokens)} tokens · ${new Date(state.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
    : '本次 App 对话还没有记录；发一条消息后开始记账。';
  renderRecent(state);
  const pct = Math.min(100, Math.max(0, Number(state.contextPercent || 0)));
  document.getElementById('contextFill').style.width = `${pct}%`;
  document.getElementById('contextText').textContent = `${pct.toFixed(1)}%`;
  const badge = document.getElementById('okBadge');
  badge.textContent = state.ok ? '已记账' : '等待首次对话';
  badge.style.background = state.ok ? '#EDF3EC' : '#F7EEE3';
  badge.style.color = state.ok ? '#5D806B' : '#9A7C63';
}

api.onState(render);
api.getState();

document.querySelectorAll('.feed-btn:not(.size-btn)').forEach((button) => {
  button.addEventListener('click', () => {
    api.demoFeed(button.dataset.tier);
    button.style.transform = 'translateY(1px)';
    setTimeout(() => { button.style.transform = ''; }, 180);
  });
});

document.querySelectorAll('.size-btn').forEach((button) => {
  button.addEventListener('click', () => {
    api.resizePet(button.dataset.size);
    button.style.transform = 'translateY(1px)';
    setTimeout(() => { button.style.transform = ''; }, 180);
  });
});

document.getElementById('openChatBtn').addEventListener('click', () => api.openChat());
document.getElementById('minBtn').addEventListener('click', () => api.minimizePanel());
document.getElementById('closeBtn').addEventListener('click', () => api.closePanel());
document.getElementById('quitBtn').addEventListener('click', () => api.quit());

const chatMessages = [];
const chatBox = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

function appendChat(role, text) {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
  return el;
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || chatSend.disabled) return;
  chatInput.value = '';
  appendChat('user', text);
  chatMessages.push({ role: 'user', content: text });
  chatSend.disabled = true;
  chatSend.textContent = '…';
  try {
    const result = await api.chatSend(chatMessages);
    if (result && result.ok && result.content) {
      appendChat('bot', result.content);
      chatMessages.push({ role: 'assistant', content: result.content });
      if (chatMessages.length > 12) chatMessages.splice(0, chatMessages.length - 12);
      if (result.state) render(result.state);
      const hint = document.getElementById('chatHint');
      if (result.usageRecorded) {
        const used = Number(result.usage && result.usage.total_tokens) || 0;
        hint.textContent = `本次 ${fmt(used)} tokens · 已记账`;
        setTimeout(() => { hint.textContent = 'Enter 发送 · Shift+Enter 换行'; }, 5000);
      } else if (result.usageMissing) {
        hint.textContent = '模型没有返回 usage，本次未记账';
        setTimeout(() => { hint.textContent = 'Enter 发送 · Shift+Enter 换行'; }, 5000);
      }
    } else {
      appendChat('error', (result && result.error) || '模型没有返回内容。');
    }
  } catch (error) {
    appendChat('error', `发送失败：${error.message}`);
  } finally {
    chatSend.disabled = false;
    chatSend.textContent = '发送';
    chatInput.focus();
  }
}

chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});

api.chatStatus().then((status) => {
  document.getElementById('chatStatus').textContent = status.message;
  if (!status.configured) {
    appendChat('bot', '先配置模型再聊：在项目根目录新建 .env，写 LLM_API_URL、LLM_API_KEY、LLM_MODEL；或者启动本机 Ollama。');
  }
}).catch(() => {
  document.getElementById('chatStatus').textContent = '模型状态检查失败，可以直接尝试发送。';
});
