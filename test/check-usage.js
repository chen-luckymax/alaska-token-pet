const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createUsageTracker } = require('../usage');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alaska-usage-'));
try {
  const tracker = createUsageTracker({ dataDir: tmp });
  const empty = tracker.snapshot();
  assert.strictEqual(empty.totalTokens, 0);
  assert.strictEqual(empty.ok, false);

  const first = tracker.recordChat({
    model: 'glm-5.2',
    usage: { prompt_tokens: 1000, completion_tokens: 250, total_tokens: 1250 }
  });
  assert.strictEqual(first.recorded, true);
  assert.strictEqual(first.state.totalTokens, 1250);
  assert.strictEqual(first.state.sessionTokens, 1250);
  assert.ok(first.state.cost > 0);
  assert.ok(first.state.budgetRemaining < first.state.dailyLimit);

  const missing = tracker.recordChat({ model: 'glm-5.2', usage: null });
  assert.strictEqual(missing.recorded, false);

  // A new process reads the same ledger: today's total must survive, session total starts at 0.
  const restarted = createUsageTracker({ dataDir: tmp });
  const afterRestart = restarted.snapshot();
  assert.strictEqual(afterRestart.todayTokens, 1250);
  assert.strictEqual(afterRestart.sessionTokens, 0);
  assert.strictEqual(afterRestart.ok, true);

  console.log('Usage OK: real usage accounting and persisted daily budget');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
