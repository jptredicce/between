const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const published = path.join(__dirname, '../index.html');
const html = fs.readFileSync(fs.existsSync(published) ? published : path.join(__dirname, '../github-pages/index.html'), 'utf8');
const source = html.slice(html.indexOf('function createHeadWorker(){'), html.indexOf('window.BetweenHeadDiagnostics='));
function setup() {
  let worker, time = 1000, closedBitmaps = 0;
  class FakeWorker {
    constructor() { worker = this; this.messages = []; this.terminated = false; }
    postMessage(message) { this.messages.push(message); }
    emit(data) { this.onmessage({ data }); }
    terminate() { this.terminated = true; }
  }
  const context = vm.createContext({
    Worker: FakeWorker, OffscreenCanvas: class {}, Blob,
    URL,
    document: { baseURI: 'https://example.test/between/' },
    performance: { now: () => time }, setTimeout, clearTimeout,
    createImageBitmap: async () => ({ close() { closedBitmaps++; } }),
  });
  const api = vm.runInContext(source + '\ncreateHeadWorker()', context);
  return { api, get worker() { return worker; }, setTime: value => time = value, get closedBitmaps() { return closedBitmaps; } };
}
const tick = () => new Promise(setImmediate);
test('initialization completes only after worker is ready', async () => {
  const { api, worker } = setup(); let ready = false;
  const initialization = api.initialize().then(() => ready = true);
  await tick(); assert.equal(ready, false);
  worker.emit({ type: 'ready' }); await initialization;
  assert.equal(ready, true); api.close(); assert(worker.terminated);
});
test('one pending frame, matching replies, adaptive timing and stale result rejection', async () => {
  const env = setup(), { api, worker } = env;
  const ready = api.initialize(); worker.emit({ type: 'ready' }); await ready;
  const received = []; api.onResults(result => received.push(result));
  const first = api.send({ image: {} }); await tick();
  await api.send({ image: {} });
  assert.equal(worker.messages.filter(m => m.type === 'frame').length, 1);
  worker.emit({ type: 'result', id: 999, pitch: .4, elapsed: 20 }); assert.equal(received.length, 0);
  env.setTime(1030); worker.emit({ type: 'result', id: 1, pitch: .3, elapsed: 25 }); await first;
  assert.equal(received[0].pitch, .3); assert(api.interval >= 40 && api.interval <= 160);
  const second = api.send({ image: {} }); await tick(); env.setTime(1700);
  worker.emit({ type: 'result', id: 2, pitch: .7, elapsed: 500 }); await second;
  assert.equal(received[1].pitch, null); api.close();
});
test('worker errors reject inference and shutdown settles an in-flight frame', async () => {
  const { api, worker } = setup(); const ready = api.initialize(); worker.emit({ type: 'ready' }); await ready;
  const first = api.send({ image: {} }); await tick();
  const rejected = assert.rejects(first, /test failure/);
  worker.emit({ type: 'error', id: 1, message: 'test failure' }); await rejected;
  const second = api.send({ image: {} }); await tick(); api.close(); await second;
  assert(worker.terminated); await assert.rejects(api.send({ image: {} }), /desactivado/);
});
test('worker releases transferred frames even when inference fails', async () => {
  const root = fs.existsSync(published) ? path.join(__dirname, '..') : path.join(__dirname, '../github-pages');
  const workerCode = fs.readFileSync(path.join(root, 'assets/head/head-worker.js'), 'utf8');
  let closed = false; const messages = [];
  const context = vm.createContext({ self: { postMessage: m => messages.push(m) }, performance: { now: () => 1000 } });
  vm.runInContext(workerCode, context);
  await context.self.onmessage({ data: { type: 'frame', id: 1, image: { close() { closed = true; } }, timestamp: 1000 } });
  assert(closed); assert.equal(messages[0].type, 'error');
});

test('simultaneous capture requests do not queue; stopping releases an untransferred frame', async () => {
  const env = setup(), { api, worker } = env;
  const ready = api.initialize(); worker.emit({ type: 'ready' }); await ready;
  const first = api.send({ image: {} }); const duplicate = api.send({ image: {} });
  api.close(); await Promise.all([first, duplicate]);
  assert.equal(worker.messages.filter(m => m.type === 'frame').length, 0);
  assert.equal(env.closedBitmaps, 1);
});
