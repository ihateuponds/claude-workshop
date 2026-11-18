// House: sky, roof, floors, room walls, glass elevator + core, circuits, room lights and nameplates.
'use strict';
(function (WS) {
  const L = WS.layout;
  // shared vector helpers
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }
  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, WS.css(rgb, a)); g.addColorStop(1, WS.css(rgb, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function vgrad(ctx, y0, y1, c0, c1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    return g;
  }
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  WS.g = { rr, glow, vgrad, rng };

  const ROOM_WALL = { observatory: 'wallRoof', pad: 'wallRoof', library: 'wallLibrary', workshop: 'wallWorkshop',
    archive: 'wallArchive', engine: 'wallEngine', parlor: 'wallParlor' };
  const STARS = (() => { const r = rng(5), out = []; for (let i = 0; i < 46; i++) out.push([r() * 540, r() * 150, r() * 6, r() < 0.2 ? 1.6 : 1]); return out; })();
  const CORE = { x: L.SHAFT.cx, y: 470 };

  function roomBox(key) {
    const r = L.ROOMS[key], f = L.FLOORS[r.floor];
    return { x0: r.x0, x1: r.x1, y0: r.floor === 'roof' ? 40 : f.y0, y1: f.floorY };
  }
  // where each room's circuit leaves its wall, then the path into the core
  function circuit(key) {
    const b = roomBox(key), left = b.x1 <= L.SHAFT.x0 + 1, mid = (b.x0 + b.x1) / 2;
    const yTop = b.y0 + 24;
    if (key === 'parlor') return [[150, b.y0 + 20], [L.SHAFT.x0 - 6, b.y0 + 20], [L.SHAFT.x0 - 6, CORE.y + 40], [CORE.x, CORE.y]];
    const xEdge = left ? L.SHAFT.x0 - 6 : L.SHAFT.x1 + 6;
    return [[mid, yTop], [xEdge, yTop], [xEdge, CORE.y], [CORE.x, CORE.y]];
  }
  function drawSky(ctx, s) {
    ctx.fillStyle = vgrad(ctx, 0, 180, WS.theme.C.skyTop, WS.theme.C.sky);
    ctx.fillRect(0, 0, L.W, 180);
    for (const [x, y, ph, r] of STARS) {
      const a = 0.45 + 0.45 * Math.sin(s.now * 1.3 + ph);
      ctx.fillStyle = WS.css(WS.theme.CR.star, a);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    glow(ctx, 300, 46, 40, WS.theme.CR.moon, 0.25);
    ctx.fillStyle = WS.theme.C.moon; ctx.beginPath(); ctx.arc(300, 46, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WS.theme.C.sky; ctx.beginPath(); ctx.arc(306, 41, 12, 0, Math.PI * 2); ctx.fill();
  }
  function drawRoof(ctx, s) {
    const C = WS.theme.C, CR = WS.theme.CR, lit = s.light.observatory || 0;
    // observatory dome (cut open), on the left of the roof deck
    const cx = 120, base = 160;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, base, 104, 108, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = C.shellDk; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, base, 96, 100, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = C[ROOM_WALL.observatory]; ctx.fill(); ctx.clip();
    // ribs
    ctx.strokeStyle = WS.css(CR.fg, 0.07); ctx.lineWidth = 2;
    for (let a = 0.15; a < 1; a += 0.17) { ctx.beginPath(); ctx.ellipse(cx, base, 96 * Math.cos(Math.PI / 2 * (1 - a)), 100, 0, Math.PI, 0); ctx.stroke(); }
    // the slit opens while the telescope is in use
    const open = s.slit || 0;
    ctx.fillStyle = C.sky; ctx.fillRect(cx + 4 - 2 - open * 14, 40, 4 + open * 28, 120);
    if (open > 0.05) for (let i = 0; i < 5; i++) { ctx.fillStyle = C.star; ctx.fillRect(cx + 2 - open * 10 + i * 5 * open, 64 + i * 13, 1.5, 1.5); }
    ctx.restore();
    // roof deck slab
    ctx.fillStyle = C.slab; rr(ctx, 0, base, L.W, 12, 2); ctx.fill();
    ctx.fillStyle = C.slabDk; ctx.fillRect(0, base + 8, L.W, 4);
    // pad side: small mansard roof + landing ring
    ctx.fillStyle = C.shellDk;
    ctx.beginPath(); ctx.moveTo(300, base); ctx.lineTo(320, 118); ctx.lineTo(520, 118); ctx.lineTo(540, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C[ROOM_WALL.pad]; ctx.beginPath(); ctx.moveTo(306, base); ctx.lineTo(324, 124); ctx.lineTo(516, 124); ctx.lineTo(534, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = WS.css(CR.ac, 0.35 + 0.4 * (s.light.pad || 0)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(420, base - 2, 44, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(420, base - 2, 20, 3, 0, 0, Math.PI * 2); ctx.stroke();
    for (const x of [324, 516]) { ctx.fillStyle = WS.css(CR.ac, 0.5 + 0.5 * Math.sin(s.now * 3 + x)); ctx.beginPath(); ctx.arc(x, 120, 3, 0, Math.PI * 2); ctx.fill(); }
    // chimney
    ctx.fillStyle = C.shellDk; ctx.fillRect(470, 92, 22, 28); ctx.fillStyle = C.slab; ctx.fillRect(466, 88, 30, 6);
    if (lit) glow(ctx, cx, 120, 90, CR.glow, 0.12 * lit);
  }
  function wallpaper(ctx, b, key) {
    const CR = WS.theme.CR;
    ctx.fillStyle = WS.theme.C[ROOM_WALL[key]];
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.fillStyle = WS.css(CR.fg, 0.035);
    for (let y = b.y0 + 14, r = 0; y < b.y1 - 40; y += 22, r++) for (let x = b.x0 + 10 + (r % 2) * 11; x < b.x1 - 6; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
    }
    // wainscot
    ctx.fillStyle = WS.css(CR.bg, 0.35); ctx.fillRect(b.x0, b.y1 - 46, b.x1 - b.x0, 46);
    ctx.fillStyle = WS.css(CR.fg, 0.06); ctx.fillRect(b.x0, b.y1 - 48, b.x1 - b.x0, 2);
    // ceiling shadow
    ctx.fillStyle = vgrad(ctx, b.y0, b.y0 + 34, WS.css(CR.black, 0.35), WS.css(CR.black, 0));
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, 34);
  }
  function drawFloors(ctx, s) {
    const C = WS.theme.C, CR = WS.theme.CR;
    for (const key of ['library', 'workshop', 'archive', 'engine', 'parlor']) wallpaper(ctx, roomBox(key), key);
    // slabs under each floor
    for (const f of ['f3', 'f2', 'f1']) {
      const y = L.FLOORS[f].floorY;
      ctx.fillStyle = C.slab; ctx.fillRect(0, y, L.W, 12);
      ctx.fillStyle = WS.css(CR.fg, 0.12); ctx.fillRect(0, y, L.W, 1.5);
      ctx.fillStyle = C.slabDk; ctx.fillRect(0, y + 9, L.W, 3);
    }
    // outer walls and the walls beside the shaft (with doorways at floor level)
    ctx.fillStyle = C.shellDk;
    ctx.fillRect(0, 170, 8, 610); ctx.fillRect(L.W - 8, 170, 8, 610);
    for (const f of ['f3', 'f2', 'f1']) {
      const { y0, floorY } = L.FLOORS[f];
      if (f !== 'f1') { ctx.fillRect(L.SHAFT.x0 - 4, y0, 8, floorY - y0 - 70); ctx.fillRect(L.SHAFT.x1 - 4, y0, 8, floorY - y0 - 70); }
    }
  }
  function drawShaft(ctx, s) {
    const CR = WS.theme.CR, x0 = L.SHAFT.x0 + 4, w = L.SHAFT.x1 - L.SHAFT.x0 - 8;
    ctx.fillStyle = WS.css(CR.glass, 0.06); ctx.fillRect(x0, 120, w, 660);
    ctx.strokeStyle = WS.css(CR.glass, 0.22); ctx.lineWidth = 1;
    for (const x of [x0 + 6, x0 + w - 6]) { ctx.beginPath(); ctx.moveTo(x, 120); ctx.lineTo(x, 780); ctx.stroke(); }
    // the core between floors
    const any = s.anyLit ? 1 : 0, pulse = 0.5 + 0.5 * Math.sin(s.now * 4);
    glow(ctx, CORE.x, CORE.y, 46 + any * 14, CR.core, 0.22 + any * (0.25 + 0.15 * pulse));
    ctx.fillStyle = WS.css(CR.core, 0.85); ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 7 + any * 2 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WS.css(CR.white, 0.8); ctx.beginPath(); ctx.arc(CORE.x - 2, CORE.y - 2, 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawCar(ctx, y) { // a glass car whose floor is at y
    const CR = WS.theme.CR, x0 = L.SHAFT.x0 + 8, w = L.SHAFT.x1 - L.SHAFT.x0 - 16;
    ctx.fillStyle = WS.css(CR.glass, 0.12); rr(ctx, x0, y - 66, w, 66, 4); ctx.fill();
    ctx.strokeStyle = WS.css(CR.glass, 0.5); ctx.lineWidth = 1.5; rr(ctx, x0, y - 66, w, 66, 4); ctx.stroke();
    ctx.fillStyle = WS.css(CR.metalHi, 0.8); ctx.fillRect(x0, y - 3, w, 3);
    ctx.strokeStyle = WS.css(CR.metalHi, 0.5); ctx.beginPath(); ctx.moveTo(x0 + w / 2, y - 66); ctx.lineTo(x0 + w / 2, 120); ctx.stroke();
  }
  function drawCircuits(ctx, s) {
    const CR = WS.theme.CR;
    for (const key of ['library', 'workshop', 'archive', 'engine', 'parlor', 'observatory', 'pad']) {
      if (key === 'observatory' || key === 'pad') continue;
      const pts = circuit(key), lit = s.light[key] || 0;
      ctx.strokeStyle = WS.css(CR.ac, 0.18 + 0.5 * lit); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
      ctx.fillStyle = WS.css(CR.ac, 0.35 + 0.5 * lit); ctx.beginPath(); ctx.arc(...pts[0], 3, 0, Math.PI * 2); ctx.fill();
      if (lit > 0.5) {
        const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        let d = (s.now * 160) % segs.reduce((a, b) => a + b, 0), i = 0;
        while (d > segs[i]) d -= segs[i++];
        const a = pts[i], b = pts[i + 1], q = d / segs[i], x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q;
        glow(ctx, x, y, 10, CR.glow, 0.8); ctx.fillStyle = WS.theme.C.glow; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // lights: unlit rooms dim, lit rooms get a pendant glow
  function drawLights(ctx, s) {
    const CR = WS.theme.CR;
    for (const key of Object.keys(L.ROOMS)) {
      const b = roomBox(key), lit = s.light[key] || 0;
      if (key !== 'observatory' && key !== 'pad') {
        const lx = key === 'parlor' ? 120 : (b.x0 + b.x1) / 2;
        if (lit > 0.01) glow(ctx, lx, b.y0 + 40, 170, CR.flame, 0.16 * lit);
        ctx.strokeStyle = WS.css(CR.fg, 0.15); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, b.y0); ctx.lineTo(lx, b.y0 + 22); ctx.stroke();
        ctx.fillStyle = WS.css(CR.brass, 0.9); ctx.beginPath(); ctx.ellipse(lx, b.y0 + 26, 11, 6, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = WS.css(CR.flame, 0.3 + 0.7 * lit); ctx.beginPath(); ctx.ellipse(lx, b.y0 + 27, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      const dim = 0.42 * (1 - lit);
      if (dim > 0.01) {
        ctx.fillStyle = WS.css(CR.black, dim);
        if (key === 'observatory') { ctx.beginPath(); ctx.ellipse(120, 160, 96, 100, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); }
        else if (key === 'pad') { ctx.fillRect(306, 124, 228, 36); }
        else ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
    }
  }
  const PLATE_AT = { observatory: [14, 178 - 36], pad: [318, 128], library: [14, 182], workshop: [314, 182],
    archive: [14, 382], engine: [314, 382], parlor: [14, 582] };
  function drawPlates(ctx, s) {
    const CR = WS.theme.CR;
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const [key, r] of Object.entries(L.ROOMS)) {
      const stations = r.stations || [r.station];
      const n = stations.reduce((a, st) => a + (s.counts[st] || 0), 0);
      const fl = Math.max(...stations.map(st => 1 - Math.min(1, (s.now - (s.flash[st] ?? -99)))));
      const label = n ? `${r.name} · ${n}` : r.name;
      const w = ctx.measureText(label).width + 16, [x, y] = PLATE_AT[key];
      ctx.fillStyle = WS.css(CR.bg, 0.72); rr(ctx, x, y, w, 20, 10); ctx.fill();
      ctx.strokeStyle = WS.css(CR.ac, 0.25 + 0.7 * fl); ctx.lineWidth = 1; rr(ctx, x, y, w, 20, 10); ctx.stroke();
      if (fl > 0) glow(ctx, x + w / 2, y + 10, w * 0.7, CR.glow, 0.25 * fl);
      ctx.fillStyle = WS.css(fl > 0 ? CR.glow : CR.fg, 0.9); ctx.fillText(label, x + 8, y + 10.5);
    }
  }
  function drawHouse(ctx, s) {
    drawSky(ctx, s); drawRoof(ctx, s); drawFloors(ctx, s); drawShaft(ctx, s); drawCircuits(ctx, s);
  }
  WS.house = { drawHouse, drawLights, drawPlates, drawCar, roomBox, CORE };
})(window.WS = window.WS || {});
