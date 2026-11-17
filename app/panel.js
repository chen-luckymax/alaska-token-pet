const api = window.petAPI;
const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.tab-panel')];

function setTab(name) {
  const valid = ['balance', 'chat', 'invent'];
  const target = valid.includes(name) ? name : 'balance';
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === target));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${target}`));
}
tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
api.onPanelTab((tab) => setTab(tab));

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

/* 彩蛋：烦恼发明局。纯本地生成，不调用模型、不产生 token。 */
const inventPrefixes = ['可食用', '反重力', '低电量', '社交恐惧', '会呼吸的', '防尴尬', '自动', '静音', '过期', '量子'];
const inventSuffixes = ['Mini', 'Pro', '2000', '家用版', '办公版', '静音版', '典藏版', 'Lite'];

const inventThemes = [
  {
    keywords: ['起不来', '起床', '赖床', '困', '睡', '熬夜', '失眠'],
    objects: ['闹钟', '枕头', '拖鞋', '咖啡杯', '眼罩'],
    taglines: [
      '它不会让你早起，但会让早起这件事看起来很有组织。',
      '专为「{problem}」设计，会在你睡着时自动更新。',
      '把起床变成一项需要签字的流程。',
      '它不叫你起床，它负责让你醒来后继续怀疑人生。'
    ],
    mechanisms: [
      '内置一枚对「{problem}」过度敏感的脑电波传感器。检测到你赖床时，先播放 90 秒股东大会录音，再把窗帘拉开 3 厘米。',
      '采用「反向回笼觉」技术：闹钟响后先帮你把被子盖好，再用温柔的声音通知你「今天也可以明天再努力」。',
      '设备会在你按掉闹钟的瞬间弹出一张二维码。扫码后是一份《关于你再睡五分钟的可行性研究报告》。'
    ],
    steps: [
      '把它放在床头，确保它能在你闭眼时看见你。',
      '闹钟响后不要按掉，先对它说三遍「我已经醒了」。',
      '如果它开始装睡，请手动起床；本设备不承担后续责任。'
    ],
    effects: [
      '长期使用后，你会开始给闹钟取名字。',
      '你的「再睡五分钟」会被记录成正式会议。',
      '可能让你把赖床误认为一种行为艺术。'
    ]
  },
  {
    keywords: ['找不到', '钥匙', '丢', '忘带', '眼镜', '放哪'],
    objects: ['门把手', '钥匙扣', '收纳盒', '手电筒', '外套口袋'],
    taglines: [
      '让「我明明放这里了」获得一次正式听证。',
      '它不帮你找东西，它帮你记住自己有多确定。',
      '专治「最后一次看见」，但不保证看见的是真的。'
    ],
    mechanisms: [
      '采用「最后一次出现」算法：只记录物品最后一次被看见的地方，然后在你寻找时反复播放那段回忆。',
      '设备会把「{problem}」翻译成一张藏宝图。图上的红叉会随着你的焦虑程度缓慢移动。',
      '内置一枚找不到就响的蜂鸣器。它响的时候，说明它也不知道东西在哪。'
    ],
    steps: [
      '把设备贴在门口最显眼的位置。',
      '如果它保持沉默，说明它也不确定。',
      '找不到时，请对着它重复第三遍，直到它开始装睡。'
    ],
    effects: [
      '长期使用后，你会开始给钥匙取名字。',
      '对「最后一次看见」的记忆比你还不可靠。',
      '可能让你把「找不到」误认为一种互动体验。'
    ]
  },
  {
    keywords: ['开会', '会议', '发言', '冷场', '汇报', '群', '没人说话'],
    objects: ['会议桌', '麦克风', '投影仪', '工牌', '会议纪要'],
    taglines: [
      '让每一次冷场，都看起来像一次战略停顿。',
      '它不解决问题，它负责让沉默显得很有层次。',
      '专为「{problem}」设计，但会在你开口前自动更新。'
    ],
    mechanisms: [
      '设备会检测会议中的沉默时长。超过 8 秒，它自动播放一段「大家先思考一下」的背景音。',
      '采用「空气发言」技术：你只需要点头，它会替你把「我补充一点」说得很像真的。',
      '内置一位虚拟主持人。它会在冷场时突然点名，让所有人同时低头看手机。'
    ],
    steps: [
      '开会前把它放在桌子中央，确保每个人都能看见。',
      '冷场时按下按钮，它会随机播放一句「这个方向很有价值」。',
      '如果仍然没人说话，请宣布会议进入「深度思考阶段」。'
    ],
    effects: [
      '你会开始怀念那些有人打断你的会议。',
      '设备可能把「散会」误识别为「再讲一小时」。',
      '长期使用后，你的点头会变得非常有说服力。'
    ]
  },
  {
    keywords: ['快递', '外卖', '等', '排队', '迟到', '物流'],
    objects: ['快递柜', '门铃', '外卖袋', '号码牌', '取件码'],
    taglines: [
      '它不会让快递变快，但会让等待看起来像一项服务。',
      '专治「已在派送」，但不负责派送。',
      '把「快了」变成一种可以测量的单位。'
    ],
    mechanisms: [
      '设备会把物流信息翻译成天气：「您的快递正在经历一场小到中雨」。',
      '采用「附近」算法：无论快递在哪，它都会显示「就在附近」。',
      '内置一枚计时器，专门计算你盯着门口的时间。它算得比你准。'
    ],
    steps: [
      '把设备放在门口，连接你的取件码。',
      '当它说「马上到」，请立刻坐下，因为「马上」是一个相对概念。',
      '如果快递丢了，请对着设备念出订单号，它会帮你一起沉默。'
    ],
    effects: [
      '你会开始对「派送中」三个字产生复杂情绪。',
      '设备可能把你的等待误认为一种忠诚。',
      '长期使用后，你会给快递员起一个代号。'
    ]
  },
  {
    keywords: ['没电', '充电', '电量', '手机', '关机', '插座'],
    objects: ['充电宝', '数据线', '手机壳', '插座', '无线充电板'],
    taglines: [
      '它不能发电，但它能让 1% 看起来很有希望。',
      '专为「关键时刻」设计，关键时刻不包括现在。',
      '让低电量成为一种可以被理解的性格。'
    ],
    mechanisms: [
      '设备会在电量低于 20% 时自动进入「省电人格」：屏幕变暗，语气变慢，并开始回忆人生。',
      '采用「借电」技术：它会向附近的人发送一条非常礼貌的充电请求。成功率取决于对方的心情。',
      '内置一枚反向充电芯片。它不给你充电，它负责在你没电时替你保持沉默。'
    ],
    steps: [
      '把设备贴在手机背面，确保它比你先感到焦虑。',
      '电量低于 10% 时，请对它说「再撑五分钟」。',
      '如果它关机了，说明它已经尽力了。'
    ],
    effects: [
      '你会开始把充电线称为「生命线」。',
      '设备可能把你的低电量误认为一种休息信号。',
      '长期使用后，你会对红色电池图标产生共情。'
    ]
  },
  {
    keywords: ['拖延', '不想', '工作', '学习', '论文', 'deadline', '加班', '写'],
    objects: ['键盘', '便利贴', '台灯', '记事本', '待办清单'],
    taglines: [
      '它不帮你完成任务，它帮你把任务整理得更有仪式感。',
      '专为「等会儿再做」设计，等会儿再做。',
      '把拖延变成一项需要归档的正式活动。'
    ],
    mechanisms: [
      '设备会把你的待办事项按「焦虑程度」重新排序。最焦虑的那条会被放在最下面。',
      '采用「明天人格」技术：它会替你写一份今天不做的理由，理由非常充分。',
      '内置一枚进度条。进度条会动，但和任务无关。'
    ],
    steps: [
      '打开设备，写下今天最不想做的一件事。',
      '按下按钮，它会为你生成一份《暂缓执行申请书》。',
      '把申请书贴在屏幕上，然后继续刷手机。'
    ],
    effects: [
      '你会开始收集「明天一定」的截图。',
      '设备可能把你的拖延误认为深度思考。',
      '长期使用后，你的待办清单会变得比小说好看。'
    ]
  },
  {
    keywords: ['社恐', '尴尬', '打招呼', '聊天', '聚会', '社交', '内向'],
    objects: ['工牌', '门铃', '外套', '名片', '口罩'],
    taglines: [
      '它不帮你社交，它帮你把沉默包装成一种风格。',
      '专为「假装在看手机」设计，续航一整天。',
      '让每一次对视，都有一个合理的退出按钮。'
    ],
    mechanisms: [
      '设备会检测附近的社交压力。当有人朝你走来，它会自动播放一段「我正在处理很重要的事」的背景音。',
      '采用「低电量人格」技术：你只需要说「我手机快没电了」，它会替你补充一个遗憾的表情。',
      '内置一枚尴尬吸收器。它吸走你的尴尬，然后把尴尬转交给下一位路过的人。'
    ],
    steps: [
      '把设备戴在胸前，确保它比你先看到熟人。',
      '当对方靠近，按下按钮，它会生成一句得体的寒暄。',
      '如果寒暄失败，请低头看设备，它会显示「信号不好」。'
    ],
    effects: [
      '你会开始把「我先走了」说得越来越自然。',
      '设备可能把你的社恐误认为一种高级审美。',
      '长期使用后，你的耳机将成为身体的一部分。'
    ]
  },
  {
    keywords: ['饿', '吃什么', '选择', '减肥', '夜宵', '饭', '外卖'],
    objects: ['饭勺', '冰箱', '外卖袋', '菜单', '零食柜'],
    taglines: [
      '它不替你决定吃什么，它只负责让选择看起来很难。',
      '专治「随便」，但不负责随便之后的结果。',
      '把饥饿翻译成一份需要审批的菜单。'
    ],
    mechanisms: [
      '设备会把附近所有餐厅按「卡路里焦虑」排序。最想吃的永远排在最后。',
      '采用「随便」算法：无论你说什么，它都会回答「都可以」，然后开始沉默。',
      '内置一枚饭点提醒器。它会在你刚决定减肥时，播放一段炸鸡 ASMR。'
    ],
    steps: [
      '打开设备，输入你现在的饥饿等级。',
      '让它为你生成三份菜单：想吃的、该吃的、和不敢吃的。',
      '选择第三份，然后点第一份。'
    ],
    effects: [
      '你会开始把「明天再减」写进每日计划。',
      '设备可能把你的夜宵误认为早餐。',
      '长期使用后，你的冰箱会拥有自己的意见。'
    ]
  },
  {
    keywords: ['猫', '宠物', '掉毛', '半夜', '跑酷', '狗'],
    objects: ['猫抓板', '逗猫棒', '自动喂食器', '毛毯', '激光笔'],
    taglines: [
      '它不负责管教，它负责把拆家记录成一项艺术行为。',
      '专为「半夜跑酷」设计，白天静音。',
      '让每一根猫毛，都拥有正式的出处。'
    ],
    mechanisms: [
      '设备会在猫开始跑酷时自动打开夜灯，并把声音翻译成「它只是在练习成为一只豹」。',
      '采用「自动投喂」技术：猫一叫，设备就投喂；设备一投喂，猫就叫。',
      '内置一枚掉毛计数器。它不会清理，它只负责让你知道今天又掉了多少。'
    ],
    steps: [
      '把设备放在猫最常经过的地方。',
      '当猫开始半夜跑酷，请按下按钮，它会播放一段草原风声。',
      '如果猫不理你，说明设备已经进入待机，或者猫已经赢了。'
    ],
    effects: [
      '你会开始把猫毛称为「家里的雪」。',
      '设备可能把猫的哈欠误认为一种授权。',
      '长期使用后，你会怀疑谁才是这个家的主人。'
    ]
  }
];

const inventGeneric = {
  objects: ['门把手', '遥控器', '收纳盒', '记事本', '小夜灯'],
  taglines: [
    '它不解决问题，它只负责让问题看起来很有前途。',
    '专为「{problem}」设计，但会在你认真时自动更新。',
    '把一件小事，做成一份需要签字的档案。'
  ],
  mechanisms: [
    '设备会持续监测「{problem}」出现的频率。频率越高，它越安静，直到你开始怀疑它到底有没有在工作。',
    '采用「先记录、后理解」技术：它先把问题写进档案，再慢慢研究为什么你会被这件事困扰。',
    '内置一枚荒诞传感器。它会把你的烦恼翻译成一个听起来很贵的产品名。'
  ],
  steps: [
    '把设备放在你看得见的地方，确保它看起来像在解决问题。',
    '遇到「{problem}」时按下按钮，等待三秒。',
    '如果三秒后没有变化，请再按一次；如果还是没有，说明它已经进入深度思考。'
  ],
  effects: [
    '你会开始把「等会儿再说」写进正式流程。',
    '设备可能把你的烦恼误认为一种产品需求。',
    '长期使用后，你会对「已受理」三个字产生安全感。'
  ]
};

let inventSalt = 0;
let currentInvention = null;

function inventHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inventRng(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inventPick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function inventTake(list, count, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function inventFill(text, problem) {
  return String(text).replaceAll('{problem}', problem);
}

function inventTheme(problem) {
  let best = null;
  let bestScore = 0;
  inventThemes.forEach((theme) => {
    const score = theme.keywords.reduce((sum, keyword) => sum + (problem.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  });
  return best || inventGeneric;
}

function inventBuild(problem, salt) {
  const theme = inventTheme(problem);
  const rng = inventRng(inventHash(`${problem}|${salt}`));
  const name = `${inventPick(inventPrefixes, rng)}${inventPick(theme.objects, rng)} ${inventPick(inventSuffixes, rng)}`;
  const patent = `AP-${new Date().getFullYear()}-${String((inventHash(`${problem}|${salt}|patent`) % 9000) + 1000).padStart(4, '0')}`;
  return {
    problem,
    name,
    patent,
    tagline: inventFill(inventPick(theme.taglines, rng), problem),
    mechanism: inventFill(inventPick(theme.mechanisms, rng), problem),
    steps: theme.steps.slice(0, 3).map((step) => inventFill(step, problem)),
    effects: inventTake(theme.effects, 3, rng).map((effect) => inventFill(effect, problem)),
    absurdity: 88 + Math.floor(rng() * 11),
    feasibility: 2 + Math.floor(rng() * 11)
  };
}

function inventRender(invention) {
  currentInvention = invention;
  document.getElementById('inventPatent').textContent = invention.patent;
  document.getElementById('inventName').textContent = invention.name;
  document.getElementById('inventTagline').textContent = invention.tagline;
  document.getElementById('inventProblem').textContent = invention.problem;
  document.getElementById('inventMechanism').textContent = invention.mechanism;
  document.getElementById('inventAbsurdity').textContent = `${invention.absurdity}%`;
  document.getElementById('inventFeasibility').textContent = `${invention.feasibility}%`;

  const steps = document.getElementById('inventSteps');
  steps.replaceChildren(...invention.steps.map((step) => {
    const item = document.createElement('li');
    item.textContent = step;
    return item;
  }));
  const effects = document.getElementById('inventEffects');
  effects.replaceChildren(...invention.effects.map((effect) => {
    const item = document.createElement('li');
    item.textContent = effect;
    return item;
  }));

  document.getElementById('inventEmpty').hidden = true;
  document.getElementById('inventCard').hidden = false;
  document.getElementById('inventBtn').textContent = '再歪解一次';
}

function inventText(invention) {
  return [
    `阿拉斯加 · 烦恼发明局`,
    `受理档案：${invention.patent}`,
    ``,
    `发明名称：${invention.name}`,
    `原始烦恼：${invention.problem}`,
    ``,
    `一句话卖点：${invention.tagline}`,
    ``,
    `工作原理：${invention.mechanism}`,
    ``,
    `使用步骤：`,
    ...invention.steps.map((step, index) => `${index + 1}. ${step}`),
    ``,
    `已知副作用：`,
    ...invention.effects.map((effect) => `- ${effect}`),
    ``,
    `荒诞指数：${invention.absurdity}%`,
    `可行性：${invention.feasibility}%`
  ].join('\n');
}

function inventToast(message) {
  let toast = document.getElementById('inventToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'inventToast';
    toast.className = 'invent-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function inventSubmit() {
  const input = document.getElementById('inventInput');
  const problem = input.value.trim();
  if (!problem) {
    inventToast('先写一件让你皱眉的小事');
    input.focus();
    return;
  }
  inventSalt += 1;
  inventRender(inventBuild(problem, inventSalt));
  document.getElementById('inventCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function inventCopy() {
  if (!currentInvention) return;
  const text = inventText(currentInvention);
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    inventToast('档案已复制');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => inventToast('档案已复制')).catch(fallback);
  } else {
    fallback();
  }
}

function inventDownload() {
  if (!currentInvention) return;
  const blob = new Blob([inventText(currentInvention)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `阿拉斯加荒诞专利-${currentInvention.patent}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  inventToast('档案已下载');
}

const inventInput = document.getElementById('inventInput');
inventInput.addEventListener('input', () => {
  document.getElementById('inventCount').textContent = `${inventInput.value.length} / 120`;
});
document.getElementById('inventBtn').addEventListener('click', inventSubmit);
document.querySelectorAll('.invent-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    inventInput.value = chip.dataset.example || '';
    document.getElementById('inventCount').textContent = `${inventInput.value.length} / 120`;
    inventSubmit();
  });
});
document.getElementById('inventCopyBtn').addEventListener('click', inventCopy);
document.getElementById('inventDownloadBtn').addEventListener('click', inventDownload);
