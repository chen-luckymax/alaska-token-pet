const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
  const page = list.find((item) => item.url && item.url.includes('panel.html'));
  assert.ok(page, 'panel.html page not found on 9222');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const evalJs = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const raw = await evalJs(`(async () => {
    const result = await window.petAPI.chatSend([{ role: 'user', content: '你好，用一句话介绍你自己' }]);
    return JSON.stringify(result);
  })()`);
  const result = JSON.parse(raw);
  console.log('chat ok:', result.ok, 'usageRecorded:', result.usageRecorded);
  console.log('usage:', JSON.stringify(result.usage));
  assert.ok(result.ok, 'chat request failed');
  assert.ok(result.usage && Number(result.usage.total_tokens) > 0, 'provider did not return usage');
  assert.ok(result.usageRecorded, 'usage was not recorded');
  assert.ok(result.state && result.state.totalTokens > 0, 'state did not include tokens');

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const dom = JSON.parse(await evalJs(`JSON.stringify({
    tokens: document.getElementById('bigTokens').textContent,
    cost: document.getElementById('costValue').textContent,
    budget: document.getElementById('budgetValue').textContent,
    account: document.getElementById('accountBalance').textContent,
    source: document.getElementById('sourceLine').textContent
  })`));
  console.log('panel:', JSON.stringify(dom));
  assert.ok(Number(dom.tokens.replace(/,/g, '')) > 0, 'panel token number is still zero');
  assert.ok(Number(dom.cost.replace('¥', '')) > 0, 'panel cost is still zero');
  assert.ok(dom.budget !== '¥10.00', 'panel budget did not decrease');
  assert.ok(dom.account === '未接入', 'account balance should be marked unavailable');

  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(__dirname, '..', 'panel-token-live.png'), Buffer.from(shot.data, 'base64'));
  console.log('screenshot: panel-token-live.png');
  ws.close();
  console.log('E2E OK: real provider usage reached the panel');
}

main().catch((error) => {
  console.error('E2E FAILED:', error.message);
  process.exitCode = 1;
});
