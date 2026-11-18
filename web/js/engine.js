// Engine: residents, their job queues, walking/riding/acting, and today's counts. No drawing here.
'use strict';
(function (WS) {
  const L = WS.layout;
  const WALK = 110, LIFT = 260, ACT = 1.2, QUEUE_MAX = 15, QUEUE_RESUME = 3, IDLE_LEAVE = 600;
  const ORDER = ['cabinet', 'workbench', 'bookshelf', 'telescope', 'helper', 'terminal', 'desk', 'rest', 'door'];

  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function create() {
    const s = { now: 0, workers: [], counts: {}, flash: {}, seq: 0, jobSeq: 0, lastEvent: null };
    ORDER.forEach(k => { s.counts[k] = 0; s.flash[k] = -99; });
    return s;
  }
  // Drop the oldest jobs beyond `keep`, counting them at once (each event is counted exactly once).
  function collapse(s, w, keep) {
    const drop = w.queue.length - keep;
    if (drop <= 0) return;
    for (const j of w.queue.splice(0, drop)) { s.counts[j.station]++; s.flash[j.station] = s.now; }
  }
  function push(s, ev, wallNow = 0) {
    if (!ev || typeof ev !== 'object') return;
    const station = L.isStation(ev.station) ? ev.station : 'workbench';
    const session = String(ev.session ?? 'default').slice(0, 16);
    let w = s.workers.find(o => o.session === session);
    if (!w) {
      w = { session, n: s.seq++, x: L.ENTRY.x, floor: 'f1', y: L.floorY('f1') + L.OUTSIDE, face: 'U',
        queue: [], cur: null, at: null, fresh: true, walked: 0, last: s.now, lastWall: wallNow, done: -99, lastLabel: '' };
      s.workers.push(w);
    } else if (w.cur && w.cur.leave) {
      // came back before reaching the door: finish a ride in progress first, so nobody floats between floors
      if (w.cur.stage === 'ride') w.cur.cancel = true; else w.cur = null;
    }
    const label = String(ev.doing ?? ev.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || station;
    w.queue.push({ station, label, h: hash(label + ':' + s.jobSeq++) });
    w.last = s.now; w.lastWall = wallNow;
    if (w.queue.length > QUEUE_MAX) collapse(s, w, QUEUE_MAX);
  }
  function spotFor(s, w, station) {
    const sp = L.SPOTS[station];
    const busy = s.workers.filter(o => o !== w && ((o.cur && !o.cur.leave && o.cur.job.station === station) ||
      (!o.cur && o.at === station))).length;
    return sp.x + [0, 26, -26][Math.min(busy, 2)];
  }
  function start(s, w) {
    const job = w.queue.shift(), pending = w.queue.length + 1;
    const k = pending > 5 ? 5 / pending : 1;
    let path = [];
    if (job.station !== w.at) {
      path = L.pathTo({ x: w.x, floor: w.floor }, job.station);
      path[path.length - 1] = { ...path[path.length - 1], x: spotFor(s, w, job.station) };
    }
    w.cur = { job, k, stage: 'walk', path, seg: 0, t0: 0, started: s.now };
    w.at = null; w.fresh = false;
    if (!path.length) beginAct(s, w);
  }
  function beginAct(s, w, from = 0) {
    const c = w.cur;
    c.stage = 'act';
    c.t0 = s.now - from * ACT * c.k;
    s.counts[c.job.station]++;
    s.flash[c.job.station] = s.now;
    s.lastEvent = { session: w.session, station: c.job.station, label: c.job.label, at: s.now };
    w.face = L.SPOTS[c.job.station].face;
  }
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  // Advance along the path; returns true once the last step is reached.
  function move(w, dt) {
    const c = w.cur;
    while (c.seg < c.path.length) {
      const st = c.path[c.seg];
      if (st.ride) {
        if (!c.ride) c.ride = { y0: w.y, y1: L.floorY(st.floor), t: 0 };
        const r = c.ride, dist = Math.max(1, Math.abs(r.y1 - r.y0));
        c.stage = 'ride';
        r.t = Math.min(1, r.t + dt * LIFT / c.k / dist);
        w.y = r.y0 + (r.y1 - r.y0) * ease(r.t);
        if (r.t < 1) return false;
        w.floor = st.floor; c.ride = null; c.seg++; c.stage = 'walk';
        if (c.cancel) return false;
        continue;
      }
      const ty = st.exit ? L.floorY(st.floor) + L.OUTSIDE : L.floorY(st.floor);
      const dx = st.x - w.x, dy = ty - w.y, d = Math.hypot(dx, dy), step = dt * WALK / c.k;
      if (d > 0.01) w.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
      if (d <= step) { w.x = st.x; w.y = ty; w.floor = st.floor; w.walked += d; c.seg++; dt -= d / (WALK / c.k); if (dt <= 0) break; continue; }
      w.x += dx / d * step; w.y += dy / d * step; w.walked += step;
      return false;
    }
    return c.seg >= c.path.length;
  }
  function update(s, dt, wallNow = 0) {
    s.now += dt;
    for (const w of [...s.workers]) {
      if (!w.cur && w.queue.length) start(s, w);
      const c = w.cur;
      if (!c) {
        if (Math.max(s.now - w.last, wallNow - w.lastWall) > IDLE_LEAVE) {
          const path = L.pathTo({ x: w.x, floor: w.floor }, 'door');
          path.push({ x: L.ENTRY.x, floor: 'f1', exit: true });
          w.cur = { leave: true, stage: 'walk', path, seg: 0, k: 1 };
          w.at = null;
        }
        continue;
      }
      if (c.cancel && c.stage !== 'ride') { w.cur = null; continue; }
      if (c.stage === 'walk' || c.stage === 'ride') {
        if (move(w, dt)) {
          if (c.leave) { s.workers.splice(s.workers.indexOf(w), 1); continue; }
          beginAct(s, w);
        }
      } else if (s.now - c.t0 >= ACT * c.k) {
        w.cur = null; w.at = c.job.station; w.face = L.SPOTS[c.job.station].face;
        w.done = s.now; w.lastLabel = c.job.label;
        if (w.queue.length) start(s, w);
      }
    }
  }
  // The resident the caption should talk about: whoever started a job most recently, else whoever just finished.
  function focus(s) {
    let best = null;
    for (const w of s.workers) if (w.cur && !w.cur.leave && w.cur.job && (!best || w.cur.started > best.w.cur.started)) best = { w };
    if (best) return { w: best.w, text: best.w.cur.job.label, station: best.w.cur.job.station };
    const recent = s.workers.filter(w => s.now - w.done < 4).sort((a, b) => b.done - a.done)[0];
    return recent ? { w: recent, text: recent.lastLabel, station: recent.at } : null;
  }
  // Start a fresh TODAY when the local date changes.
  function rollDay(s, key) {
    if (s.day && s.day !== key) ORDER.forEach(k => { s.counts[k] = 0; s.flash[k] = -99; });
    s.day = key;
  }
  WS.engine = { focus, rollDay, WALK, LIFT, ACT, QUEUE_MAX, QUEUE_RESUME, IDLE_LEAVE, ORDER, hash, create, push, update, collapse };
})(window.WS = window.WS || {});
