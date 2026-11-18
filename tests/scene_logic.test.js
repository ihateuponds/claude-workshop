// Logic tests for the mansion scene: run with `node --test tests/`.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['layout.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.window.WS;
}
const ev = (station, session = 'aaaa1111', doing = 'x') => ({ t: 0, session, event: 'tool', station, label: station, doing });
function run(WS, s, seconds, wall = 0) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) WS.engine.update(s, dt, wall + i * dt);
}
const total = s => Object.values(s.counts).reduce((a, b) => a + b, 0);
const queued = s => s.workers.reduce((a, w) => a + w.queue.length, 0);

test('pathTo same floor is direct', () => {
  const WS = load();
  const p = WS.layout.pathTo({ x: 300, floor: 'f1' }, 'desk');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.map(s => [s.x, s.floor, !!s.ride]))), [[120, 'f1', false]]);
});

test('pathTo cross floor rides the shaft', () => {
  const WS = load();
  const p = WS.layout.pathTo({ x: 120, floor: 'f1' }, 'bookshelf');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.map(s => [s.x, s.floor, !!s.ride]))),
    [[270, 'f1', false], [270, 'f3', true], [90, 'f3', false]]);
});

test('prototype station falls back to workbench', () => {
  const WS = load();
  const s = WS.engine.create();
  for (const bad of ['constructor', '__proto__', 'toString', 'nope']) WS.engine.push(s, ev(bad));
  assert.ok(s.workers[0].queue.every(j => j.station === 'workbench'));
});

test('each event counted once', () => {
  const WS = load();
  const s = WS.engine.create();
  const st = ['bookshelf', 'workbench', 'cabinet', 'terminal', 'telescope', 'helper', 'desk', 'rest', 'door'];
  for (let i = 0; i < 20; i++) WS.engine.push(s, ev(st[i % st.length]));
  run(WS, s, 240);
  assert.strictEqual(queued(s), 0);
  assert.strictEqual(total(s), 20);
});

test('collapse keeps counts exact', () => {
  const WS = load();
  const s = WS.engine.create();
  for (let i = 0; i < 500; i++) WS.engine.push(s, ev(i % 2 ? 'terminal' : 'bookshelf'));
  const w = s.workers[0];
  assert.ok(w.queue.length <= WS.engine.QUEUE_MAX);
  assert.strictEqual(total(s) + queued(s), 500);
  WS.engine.collapse(s, w, WS.engine.QUEUE_RESUME);
  assert.strictEqual(w.queue.length, WS.engine.QUEUE_RESUME);
  assert.strictEqual(total(s) + queued(s), 500);
});

test('two residents cross floors at once', () => {
  const WS = load();
  const s = WS.engine.create();
  WS.engine.push(s, ev('bookshelf', 'aaaa1111'));
  WS.engine.push(s, ev('bookshelf', 'bbbb2222'));
  const seen = new Set();
  for (let i = 0; i < 60 * 30; i++) {
    WS.engine.update(s, 1 / 60, i / 60);
    for (const w of s.workers) if (w.cur && w.cur.stage === 'act') seen.add(w.session);
  }
  assert.deepStrictEqual([...seen].sort(), ['aaaa1111', 'bbbb2222']);
  assert.ok(s.workers.every(w => w.floor === 'f3'));
});

test('ride moves vertically between floors', () => {
  const WS = load();
  const s = WS.engine.create();
  WS.engine.push(s, ev('bookshelf'));
  let rode = false;
  for (let i = 0; i < 60 * 30; i++) {
    WS.engine.update(s, 1 / 60, i / 60);
    const w = s.workers[0];
    if (w.cur && w.cur.stage === 'ride') { rode = true; assert.strictEqual(w.x, 270); }
  }
  assert.ok(rode);
  assert.strictEqual(s.workers[0].y, WS.layout.FLOORS.f3.floorY);
});

test('idle resident leaves', () => {
  const WS = load();
  const s = WS.engine.create();
  WS.engine.push(s, ev('desk'));
  run(WS, s, 20);
  assert.strictEqual(s.workers.length, 1);
  run(WS, s, 640, 20);
  assert.strictEqual(s.workers.length, 0);
});

test('resident called back mid-ride never flies through floors', () => {
  const WS = load();
  const s = WS.engine.create(), F = WS.layout.FLOORS;
  WS.engine.push(s, ev('bookshelf'));
  run(WS, s, 20);
  const w = s.workers[0];
  for (let i = 0; i < 60 * 700 && !(w.cur && w.cur.leave && w.cur.stage === 'ride'); i++) WS.engine.update(s, 1 / 60, s.now);
  assert.ok(w.cur && w.cur.stage === 'ride', 'resident is riding down to leave');
  for (let i = 0; i < 20; i++) WS.engine.update(s, 1 / 60, s.now);
  WS.engine.push(s, ev('workbench'), s.now);
  for (let i = 0; i < 60 * 20; i++) {
    WS.engine.update(s, 1 / 60, s.now);
    if (!(w.cur && w.cur.stage === 'ride')) assert.ok(Math.abs(w.y - F[w.floor].floorY) < 0.5 || w.floor === 'f1', `off the floor at y=${w.y} floor=${w.floor}`);
  }
  assert.strictEqual(s.counts.workbench, 1);
});

test('focus is the resident whose job started most recently', () => {
  const WS = load();
  const s = WS.engine.create();
  WS.engine.push(s, ev('desk', 'first111'));
  run(WS, s, 2);
  WS.engine.push(s, ev('bookshelf', 'second22'));
  run(WS, s, 0.5, 2);
  WS.engine.push(s, ev('rest', 'first111'));
  run(WS, s, 3, 2.5);
  // first111 just started walking to rest; second22 is still on its earlier job
  assert.strictEqual(WS.engine.focus(s).w.session, 'first111');
});

test('counts reset when the day changes', () => {
  const WS = load();
  const s = WS.engine.create();
  WS.engine.rollDay(s, '2026-11-05');
  WS.engine.push(s, ev('desk'));
  run(WS, s, 10);
  WS.engine.rollDay(s, '2026-11-05');
  assert.strictEqual(s.counts.desk, 1);
  WS.engine.rollDay(s, '2026-11-06');
  assert.strictEqual(s.counts.desk, 0);
});
