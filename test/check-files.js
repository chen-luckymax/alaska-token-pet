const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

for (const file of ['README.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md', 'ARCHITECTURE.md', '.env.example', '.gitignore']) {
  assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
}

const gitignore = read('.gitignore');
assert.ok(gitignore.includes('.env'), '.gitignore must ignore .env');
assert.ok(gitignore.includes('node_modules'), '.gitignore must ignore node_modules');
assert.ok(gitignore.includes('tools/'), '.gitignore must ignore the local Blender toolchain');

const main = read('main.js');
assert.ok(main.includes('function safeLog'), 'safeLog logger is missing');
assert.ok(main.includes('function safeError'), 'safeError logger is missing');
assert.ok(main.includes("ipcMain.handle('chat-send'"), 'chat-send IPC is missing');
assert.ok(!main.includes('LLM_API_KEY='), 'main.js must not contain a literal key assignment');

const example = read('.env.example');
assert.ok(example.includes('LLM_API_URL'), '.env.example must document LLM_API_URL');
assert.ok(example.includes('LLM_API_KEY'), '.env.example must document LLM_API_KEY');

const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts && pkg.scripts.start, 'package.json missing start script');
assert.ok(pkg.scripts.test, 'package.json missing test script');

const glb = fs.statSync(path.join(root, 'app', 'assets', 'lulu.glb'));
assert.ok(glb.size > 1024 * 1024, 'GLB is unexpectedly small');

console.log('Repo OK: docs, ignores, IPC and package scripts');
