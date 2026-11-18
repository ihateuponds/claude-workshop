// Main: canvas sizing, the frame loop, demos, ?at stills, live events over SSE, theme refresh.
// Params: ?static=1 (no fetches), ?demo=all|burst|two|close, ?at=<ms>, ?theme=bg,fg,accent,r,g,y,b,m,c, ?log=1
'use strict';
(function (WS) {
  const L = WS.layout, E = WS.engine;
  const Q = new URLSearchParams(location.search);
  const STATIC = Q.get('static') === '1', DEMO = Q.get('demo'), LOG = Q.get('log') === '1';
  const AT = Q.has('at') ? Math.max(0, Number(Q.get('at')) || 0) : null;
  const THEME_PARAM = WS.theme.fromParam(Q.get('theme'));
  if (THEME_PARAM) WS.theme.set(THEME_PARAM);

  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  let scale = 1;
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    scale = Math.min(innerWidth / L.W, innerHeight / L.H);
    cv.style.width = L.W * scale + 'px'; cv.style.height = L.H * scale + 'px';
    cv.width = Math.round(L.W * scale * dpr); cv.height = Math.round(L.H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  let still = false; // a frozen ?at frame: redraw it after any resize (resizing clears the canvas)
  addEventListener('resize', () => { fit(); if (still) render(); });
  fit();

  const s = E.create();
  s.light = {}; s.slit = 0; s.anyLit = false;
  const wallNow = () => (AT !== null || DEMO ? s.now : Date.now() / 1000);
  const push = ev => E.push(s, ev, wallNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') s.workers.forEach(w => E.collapse(s, w, E.QUEUE_RESUME));
  });

  function updateLights(dt) {
    const target = {};
    for (const w of s.workers) if (w.cur && w.cur.stage === 'act') target[L.STATION_ROOM[w.cur.job.station]] = 1;
    const k = Math.min(1, dt / 0.4);
    for (const key of Object.keys(L.ROOMS)) s.light[key] = (s.light[key] || 0) + ((target[key] || 0) - (s.light[key] || 0)) * k;
    s.anyLit = Object.keys(target).length > 0;
    const scope = s.workers.some(w => w.cur && w.cur.stage === 'act' && w.cur.job.station === 'telescope');
    s.slit += ((scope ? 1 : 0) - s.slit) * k;
  }
  function basePose(w) {
    return { x: w.x, y: w.y, face: w.face, sit: false, lookUp: false, hide: false, riding: !!(w.cur && w.cur.stage === 'ride'),
      handL: null, handR: null, walk: w.cur && w.cur.stage === 'walk' ? w.walked : null,
      blink: (s.now + w.n * 1.7) % 4 < 0.12, coat: WS.theme.coat(w.n) };
  }
  // what the caption should talk about (see engine.focus), with the resident's color
  function focus() {
    const f = E.focus(s);
    if (!f) return null;
    const c = WS.theme.coat(f.w.n);
    return { color: c.base, rgb: c.rgb, text: f.text, station: f.station };
  }
  function render() {
    ctx.save();
    try { drawFrame(); } finally { ctx.restore(); }
  }
  function drawFrame() {
    WS.house.drawHouse(ctx, s);
    WS.rooms.furniture(ctx, s);
    WS.house.drawLights(ctx, s);
    WS.house.drawPlates(ctx, s);
    const riding = s.workers.filter(w => w.cur && w.cur.stage === 'ride');
    if (riding.length) s.carY = riding[riding.length - 1].y + 2; // the car stays where it last stopped
    else WS.house.drawCar(ctx, s.carY ?? L.FLOORS.f1.floorY);
    const poses = s.workers.map(w => [w, basePose(w)]);
    for (const [w, p] of poses) {
      const c = w.cur;
      if (c && c.stage === 'act') p.anim = { station: c.job.station, p: Math.min(1, Math.max(0, (s.now - c.t0) / (E.ACT * c.k))), h: c.job.h };
      else if (!c && w.at === 'rest') p.anim = { station: 'rest', p: null, h: 0 };
      if (p.anim) WS.rooms.pose(p, w, s);
    }
    poses.sort((a, b) => a[1].y - b[1].y);
    for (const [w, p] of poses) {
      if (p.riding) WS.house.drawCar(ctx, p.y + 2);
      if (p.anim) WS.rooms.behind(ctx, p, w, s);
      if (!p.hide) WS.drawResident(ctx, p, s);
      if (p.anim) WS.rooms.front(ctx, p, w, s);
    }
    WS.rooms.foreground(ctx, s);
    const bubbles = [];
    for (const [w, p] of poses) {
      if (p.hide) continue;
      const text = w.cur ? (w.cur.leave ? null : w.cur.job.label) : (s.now - w.done < 4 ? w.lastLabel : null);
      if (text) bubbles.push({ x: p.x, y: p.y - (p.sit ? 52 : 62), text, color: p.coat.base });
    }
    WS.drawBubbles(ctx, bubbles);
    WS.drawCaption(ctx, s, focus());
    ripple();
  }
  // a mind ripples now and then: a band of the picture slips sideways with colored edges
  function ripple() {
    const cyc = 10, ph = s.now % cyc;
    if (ph > 0.2) return;
    const r = WS.g.rng(Math.floor(s.now / cyc) + 3), y0 = 40 + r() * 700, h = 14 + r() * 40, dx = (r() < 0.5 ? -1 : 1) * (4 + r() * 6);
    const k = cv.width / L.W;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, y0 * k, cv.width, h * k, dx * k, y0 * k, cv.width, h * k);
    ctx.restore();
    ctx.fillStyle = WS.css(WS.theme.CR.cyan, 0.5); ctx.fillRect(0, y0, L.W, 1);
    ctx.fillStyle = WS.css(WS.theme.CR.magenta, 0.5); ctx.fillRect(0, y0 + h, L.W, 1);
  }

  /* ---------------- demos ---------------- */
  const LABELS = {
    cabinet: ['Move Downloads items into their new folders', 'Moving files to Archive'],
    workbench: ['Editing scene.js', 'Writing notes.md'],
    bookshelf: ['Reading README.md', 'Searching files'],
    telescope: ['Searching the web: hyprland window rules', 'Reading wiki.archlinux.org'],
    helper: ['Helper: Review Task 2', 'Helper: Implement the launcher'],
    terminal: ['Run the full test suite', 'Show working tree status'],
    desk: ['Updating the to-do list', 'Asking you a question'],
    rest: ['Done, resting'], door: ['Got a new task'],
  };
  const LONG = 'Supercalifragilisticexpialidociousword plus more words here';
  const ORDER9 = ['door', 'bookshelf', 'workbench', 'cabinet', 'terminal', 'telescope', 'helper', 'desk', 'rest'];
  function ev(t, session, station, i, doing) {
    return { t, ev: { t, session, station, doing: doing || LABELS[station][i % LABELS[station].length],
      event: station === 'rest' ? 'stop' : station === 'door' ? 'prompt' : 'tool' } };
  }
  function demoScript(name) {
    const out = [];
    if (name === 'all') ORDER9.forEach((st, i) => out.push(ev(0.5 + i * 7, 'a1b2c3d4', st, i)));
    else if (name === 'burst') {
      const r = WS.g.rng(42), tools = ORDER9.slice(1, 8);
      out.push(ev(0.5, 'b0b0cafe', 'door', 0));
      for (let i = 0; i < 48; i++) out.push(ev(1 + i * 0.06, 'b0b0cafe', tools[Math.floor(r() * tools.length)], i));
      out.push(ev(4, 'b0b0cafe', 'rest', 0));
    } else if (name === 'two') {
      ['door', 'bookshelf', 'workbench', 'terminal', 'desk', 'rest'].forEach((st, i) => out.push(ev(0.5 + i * 6, 'a1b2c3d4', st, i)));
      ['door', 'telescope', 'cabinet', 'helper', 'workbench', 'rest'].forEach((st, i) => out.push(ev(2.5 + i * 6, 'e5f6a7b8', st, i + 1)));
    } else if (name === 'close') {
      ['door', 'terminal', 'bookshelf', 'workbench'].forEach((st, i) => {
        out.push(ev(0.5 + i * 6, 'a1b2c3d4', st, i, i === 2 ? LONG : null));
        out.push(ev(0.6 + i * 6, 'e5f6a7b8', st, i + 1));
      });
    }
    return out.sort((a, b) => a.t - b.t);
  }
  const demo = DEMO ? demoScript(DEMO) : [];
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function tick(dt) {
    if (!DEMO && AT === null) E.rollDay(s, dayKey());
    while (demo.length && demo[0].t <= s.now) push(demo.shift().ev);
    E.update(s, dt, wallNow());
    updateLights(dt);
  }

  /* ---------------- live ---------------- */
  function loadTheme() {
    if (STATIC || THEME_PARAM) return;
    fetch('/theme').then(r => r.json()).then(t => WS.theme.set(t)).catch(() => {});
  }
  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('counts', e => {
      let seed = {};
      try { seed = JSON.parse(e.data) || {}; } catch (_) { return; }
      for (const st of E.ORDER) {
        const pending = s.workers.reduce((a, w) => a + w.queue.filter(j => j.station === st).length +
          (w.cur && !w.cur.leave && w.cur.stage !== 'act' && w.cur.job.station === st ? 1 : 0), 0);
        s.counts[st] = Math.max(0, (Number(seed[st]) || 0) - pending);
      }
    });
    es.onmessage = e => { try { push(JSON.parse(e.data)); } catch (_) { /* skip bad line */ } };
    es.onerror = () => { es.close(); setTimeout(connect, 3000); };
  }
  if (!STATIC) { loadTheme(); setInterval(loadTheme, 30000); if (!DEMO) connect(); }

  window.workshop = {
    push,
    state: () => ({ now: s.now, counts: { ...s.counts },
      workers: s.workers.map(w => ({ session: w.session, x: w.x, y: w.y, floor: w.floor, queue: w.queue.length,
        stage: w.cur ? w.cur.stage : 'idle', station: w.cur && w.cur.job ? w.cur.job.station : w.at })) }),
  };

  if (AT !== null) {
    const steps = Math.round(AT / 1000 * 60);
    for (let i = 0; i < steps; i++) tick(1 / 60);
    still = true;
    render();
    if (LOG) console.log('[ws] state ' + JSON.stringify(window.workshop.state()));
  } else {
    let last = null, loopErr = false;
    const loop = ts => {
      requestAnimationFrame(loop); // re-arm first so one bad frame can never freeze the scene
      try {
        if (last !== null) tick(Math.min(0.1, Math.max(0, (ts - last) / 1000)));
        render();
      } catch (err) {
        if (!loopErr) { loopErr = true; console.error('[workshop] frame error', err); }
        if (ctx.reset) ctx.reset(); fit(); // never let a half-drawn frame leave clips or transforms behind
      }
      last = ts;
    };
    requestAnimationFrame(loop);
  }
})(window.WS = window.WS || {});
