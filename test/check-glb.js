const assert = require('assert');
const fs = require('fs');
const path = require('path');

const glbPath = path.join(__dirname, '..', 'app', 'assets', 'lulu.glb');
const buf = fs.readFileSync(glbPath);
assert.strictEqual(buf.readUInt32LE(0), 0x46546c67, 'not a GLB file');
assert.strictEqual(buf.readUInt32LE(4), 2, 'unsupported GLB version');

const chunkLength = buf.readUInt32LE(12);
assert.strictEqual(buf.readUInt32LE(16), 0x4e4f534a, 'first chunk is not JSON');
const gltf = JSON.parse(buf.subarray(20, 20 + chunkLength).toString('utf8'));

assert.ok(Array.isArray(gltf.animations), 'no animations');
assert.ok(gltf.animations.length >= 9, `expected at least 9 clips, got ${gltf.animations.length}`);

const expected = [
  'Eat_IceCream', 'Eat_Meal', 'Idle_Breathe', 'Idle_Groom', 'Idle_Look',
  'Idle_Stretch', 'Idle_Wiggle', 'Idle_Yawn', 'Touch_Happy'
];
for (const name of expected) {
  assert.ok(gltf.animations.some((clip) => clip.name === name), `missing clip: ${name}`);
}
assert.strictEqual(gltf.skins.length, 1, 'expected one skin');
assert.ok(gltf.meshes.length > 10, 'model has too few meshes');
assert.ok(gltf.nodes.length > 20, 'rig is unexpectedly small');

console.log(`GLB OK: ${gltf.animations.length} clips, ${gltf.meshes.length} meshes, ${gltf.nodes.length} nodes`);
