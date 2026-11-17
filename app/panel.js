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
function money(n) {
  return `¥${Number(n || 0).toFixed(2)}`;
}

function render(state) {
  if (!state) return;
  const tokens = Number(state.totalTokens || 0);
  document.getElementById('bigTokens').textContent = fmt(tokens);
  document.getElementById('costValue').textContent = money(state.cost);
  document.getElementById('budgetValue').textContent = money(state.budgetRemaining);
  const limit = state.settings && state.settings.budget ? state.settings.budget.dailyLimit : 10;
  document.getElementById('budgetHint').textContent = `上限 ${money(limit)}`;
  document.getElementById('sourceLine').textContent = state.ok
    ? `${state.source} · ${new Date(state.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
    : '还没有找到 Codex / CSG 会话，先在终端跑一轮任务。';
  const pct = Math.min(100, Math.max(0, Number(state.contextPercent || 0)));
  document.getElementById('contextFill').style.width = `${pct}%`;
  document.getElementById('contextText').textContent = `${pct.toFixed(1)}%`;
  const badge = document.getElementById('okBadge');
  badge.textContent = state.ok ? '已连接' : '等待中';
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
