// Rooms: furniture for every room, and each station's event animation.
// furniture(ctx, s) draws what stands behind residents; foreground(ctx, s) what stands in front of them.
// For an acting resident: pose(p, w, s) sets its posture, behind()/front() draw the animation around it.
'use strict';
(function (WS) {
  const { rr, glow, rng } = WS.g;
  const T = () => WS.theme;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const arcQ = q => Math.sin(Math.PI * clamp(q, 0, 1));
  const fill = (ctx, c) => { ctx.fillStyle = c; ctx.fill(); };
  function box(ctx, x, y, w, h, r, c) { rr(ctx, x, y, w, h, r); fill(ctx, c); }
  function circle(ctx, x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fill(ctx, c); }
  function shadow(ctx, x, y, w) { ctx.fillStyle = WS.css(T().CR.black, 0.25); ctx.beginPath(); ctx.ellipse(x, y, w, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  const col = (k, a = 1) => WS.css(T().CR[k], a);
  const pal = (i, t = 0.25) => WS.css(WS.mix(T().PAL[i % 6], T().CR.bg, t));

  /* ---------------- library ---------------- */
  const BOOKS = (() => {
    const r = rng(7), out = [], rows = [[214, 244], [250, 280], [286, 316], [322, 350]];
    rows.forEach(([top, bot], ri) => {
      let x = 26;
      while (x < 162) {
        const w = 6 + Math.floor(r() * 5), h = bot - top - 3 - Math.floor(r() * 8);
        if (x + w > 164) break;
        out.push({ x, y: bot - h, w, h, c: Math.floor(r() * 6), t: 0.2 + r() * 0.3, row: ri, lean: r() < 0.07 });
        x += w + 1 + (r() < 0.1 ? 4 : 0);
      }
    });
    return out;
  })();
  function library(ctx, s, pop) {
    box(ctx, 18, 204, 152, 154, 4, col('woodDk'));
    box(ctx, 22, 208, 144, 146, 3, WS.css(WS.mix(T().CR.woodDk, T().CR.black, 0.35)));
    BOOKS.forEach((b, i) => {
      if (i === pop) return;
      box(ctx, b.x, b.y, b.w, b.h, 1.5, pal(b.c, b.t));
      ctx.fillStyle = WS.css(T().CR.white, 0.12); ctx.fillRect(b.x + 1, b.y + 4, b.w - 2, 2);
    });
    for (const y of [244, 280, 316, 350]) box(ctx, 20, y, 148, 5, 1, col('wood'));
    // round window + reading lamp
    circle(ctx, 206, 236, 20, col('woodDk')); circle(ctx, 206, 236, 16, col('sky'));
    circle(ctx, 212, 230, 2, col('star'));
    ctx.strokeStyle = col('brass'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(214, 358); ctx.lineTo(214, 300); ctx.quadraticCurveTo(214, 290, 204, 290); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(200, 292, 10, 5, 0, Math.PI, 0); fill(ctx, col('brass'));
  }
  /* ---------------- workshop ---------------- */
  function workshopBack(ctx) {
    // pegboard with tools
    box(ctx, 330, 210, 180, 70, 4, WS.css(WS.mix(T().CR.wood, T().CR.bg, 0.35)));
    ctx.fillStyle = WS.css(T().CR.black, 0.25);
    for (let x = 340; x < 504; x += 12) for (let y = 220; y < 274; y += 12) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = col('metalHi'); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(350, 226); ctx.lineTo(350, 262); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(370, 228); ctx.lineTo(384, 262); ctx.stroke();
    ctx.strokeStyle = col('brass'); ctx.beginPath(); ctx.arc(480, 244, 12, 0.3, Math.PI * 1.7); ctx.stroke();
    ctx.lineCap = 'butt';
    box(ctx, 440, 230, 22, 30, 3, col('metal'));
  }
  function draftingTable(ctx, q) {
    // tilted board on legs, in front of the resident
    ctx.strokeStyle = col('woodDk'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(384, 336); ctx.lineTo(376, 358); ctx.moveTo(456, 336); ctx.lineTo(464, 358); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(364, 340); ctx.lineTo(476, 340); ctx.lineTo(468, 316); ctx.lineTo(372, 316); ctx.closePath(); fill(ctx, col('wood'));
    ctx.beginPath(); ctx.moveTo(374, 336); ctx.lineTo(466, 336); ctx.lineTo(460, 320); ctx.lineTo(380, 320); ctx.closePath();
    fill(ctx, WS.css(WS.mix(T().CR.blue, T().CR.bg, 0.45)));
    ctx.strokeStyle = WS.css(T().CR.white, 0.18); ctx.lineWidth = 0.8;
    for (let i = 1; i < 6; i++) { const y = 320 + i * 2.7; ctx.beginPath(); ctx.moveTo(380 - i * 1.1, y); ctx.lineTo(460 + i * 1.1, y); ctx.stroke(); }
    if (q != null) { // glowing lines draw themselves onto the blueprint
      const segs = [[386, 333, 410, 323], [410, 323, 432, 330], [432, 330, 452, 322], [392, 327, 446, 327], [420, 321, 420, 335]];
      const n = q * segs.length;
      ctx.strokeStyle = col('glow'); ctx.lineWidth = 1.6;
      segs.forEach((sg, i) => {
        const f = clamp(n - i, 0, 1); if (!f) return;
        ctx.beginPath(); ctx.moveTo(sg[0], sg[1]); ctx.lineTo(lerp(sg[0], sg[2], f), lerp(sg[1], sg[3], f)); ctx.stroke();
      });
      const i = Math.min(segs.length - 1, Math.floor(n)), f = clamp(n - i, 0, 1), sg = segs[i];
      glow(ctx, lerp(sg[0], sg[2], f), lerp(sg[1], sg[3], f), 12, T().CR.glow, 0.7);
    }
  }
  /* ---------------- archive ---------------- */
  const DRAWERS = [[20, 60], [130, 176]]; // two cabinets: x range
  function drawerY(i) { return 446 + i * 26; }
  function archive(ctx, s, open) {
    for (const [ci, [x0, x1]] of DRAWERS.entries()) {
      box(ctx, x0 - 4, 432, x1 - x0 + 8, 126, 4, col('woodDk'));
      for (let d = 0; d < 4; d++) {
        const y = drawerY(d), isOpen = open && open[ci] === d, dx = isOpen ? 6 : 0;
        box(ctx, x0 + (ci ? dx : -dx), y, x1 - x0, 22, 3, col(isOpen ? 'woodHi' : 'wood'));
        box(ctx, x0 + (ci ? dx : -dx) + (x1 - x0) / 2 - 9, y + 5, 18, 6, 2, WS.css(T().CR.ac, isOpen ? 0.9 : 0.35));
        circle(ctx, x0 + (ci ? dx : -dx) + (x1 - x0) / 2, y + 16, 2, col('brass'));
      }
    }
    // a framed map on the wall
    box(ctx, 196, 420, 34, 44, 2, col('brassDk')); box(ctx, 199, 423, 28, 38, 1, col('paper'));
    ctx.strokeStyle = WS.css(T().CR.ink, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(203, 450); ctx.bezierCurveTo(210, 430, 218, 455, 223, 432); ctx.stroke();
  }
  /* ---------------- engine room ---------------- */
  function gear(ctx, x, y, r, teeth, a, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const rad = i % 2 ? r : r + 4, ang = (i / (teeth * 2)) * Math.PI * 2; ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
    ctx.closePath(); fill(ctx, c);
    circle(ctx, 0, 0, r * 0.45, WS.css(T().CR.black, 0.35)); circle(ctx, 0, 0, 3, col('metalHi'));
    ctx.restore();
  }
  function engine(ctx, s, a) {
    const run = a ? a.p : 0, spin = s.now * (a ? 3 : 0.25);
    box(ctx, 350, 400, 172, 150, 8, col('metalDk'));
    box(ctx, 356, 406, 160, 138, 6, WS.css(WS.mix(T().CR.metalDk, T().CR.black, 0.25)));
    gear(ctx, 392, 446, 22, 10, spin, col('brass'));
    gear(ctx, 428, 470, 14, 8, -spin * 1.6 + 0.3, col('brassDk'));
    // gauges
    for (const [gx, base] of [[478, 432], [478, 476]]) {
      circle(ctx, gx, base, 15, col('metal')); circle(ctx, gx, base, 12, col('paper'));
      const ang = -2.4 + (a ? 1.2 + Math.sin(s.now * 5 + gx) * 0.6 + run * 1.6 : 0.4);
      ctx.strokeStyle = col('red'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, base); ctx.lineTo(gx + Math.cos(ang) * 10, base + Math.sin(ang) * 10); ctx.stroke();
      circle(ctx, gx, base, 2, col('ink'));
    }
    // console screen
    box(ctx, 380, 500, 80, 34, 4, col('metal'));
    box(ctx, 384, 504, 72, 26, 3, WS.css(WS.mix(T().CR.ac, T().CR.black, a ? 0.55 : 0.82)));
    if (a) {
      const r = rng(a.h), lines = Math.min(5, Math.floor(run * 6) + 1);
      ctx.fillStyle = col('glow');
      for (let i = 0; i < lines; i++) ctx.fillRect(388, 508 + i * 4.4, 8 + r() * 50, 2);
    }
    // pipes
    ctx.strokeStyle = col('metal'); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(508, 400); ctx.lineTo(508, 384); ctx.lineTo(530, 384); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(360, 400); ctx.lineTo(360, 380); ctx.stroke();
  }
  function steam(ctx, s, q) {
    for (let i = 0; i < 5; i++) {
      const t = clamp(q * 1.4 - i * 0.12, 0, 1); if (!t || t >= 1) continue;
      ctx.fillStyle = WS.css(T().CR.fg, 0.35 * (1 - t));
      ctx.beginPath(); ctx.arc(360 + Math.sin(i * 2 + t * 4) * 6, 378 - t * 60, 6 + t * 12, 0, Math.PI * 2); ctx.fill();
    }
  }
  /* ---------------- roof ---------------- */
  function telescope(ctx, s, q) {
    const ang = -1.05 + (q != null ? Math.sin(Math.PI * clamp(q * 1.2, 0, 1)) * -0.18 : 0);
    ctx.strokeStyle = col('woodDk'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(92, 132); ctx.lineTo(80, 160); ctx.moveTo(92, 132); ctx.lineTo(104, 160); ctx.moveTo(92, 132); ctx.lineTo(92, 160); ctx.stroke();
    ctx.save(); ctx.translate(92, 132); ctx.rotate(ang);
    box(ctx, -6, -6, 74, 12, 6, col('brass')); box(ctx, 52, -8, 18, 16, 4, col('brassDk')); box(ctx, -12, -4, 8, 8, 2, col('metalDk'));
    ctx.restore();
    if (q != null && q > 0.35) {
      const k = Math.sin(Math.PI * clamp((q - 0.35) / 0.6, 0, 1));
      const x = 124, y = 58;
      glow(ctx, x, y, 22 * k + 4, T().CR.star, 0.6 * k);
      ctx.strokeStyle = WS.css(T().CR.white, k); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 10 * k, y); ctx.lineTo(x + 10 * k, y); ctx.moveTo(x, y - 10 * k); ctx.lineTo(x, y + 10 * k); ctx.stroke();
    }
  }
  function drone(ctx, x, y, s, c) {
    shadow(ctx, x, 158, 10);
    box(ctx, x - 12, y - 6, 24, 12, 6, col('metal'));
    box(ctx, x - 8, y - 3, 16, 6, 3, WS.css(T().CR.black, 0.5));
    circle(ctx, x - 3 + Math.sin(s.now * 3) * 3, y, 2, col('glow'));
    ctx.strokeStyle = col('metalHi'); ctx.lineWidth = 1.5;
    const sp = Math.sin(s.now * 40) * 9;
    ctx.beginPath(); ctx.moveTo(x - 12, y - 8); ctx.lineTo(x - 4, y - 8); ctx.moveTo(x + 4, y - 8); ctx.lineTo(x + 12, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8 - sp * 0.5, y - 11); ctx.lineTo(x - 8 + sp * 0.5, y - 11); ctx.moveTo(x + 8 - sp * 0.5, y - 11); ctx.lineTo(x + 8 + sp * 0.5, y - 11); ctx.stroke();
    circle(ctx, x + 10, y + 3, 1.6, c);
  }
  /* ---------------- parlor ---------------- */
  function parlorBack(ctx, s, a) {
    // rug
    ctx.fillStyle = WS.css(WS.mix(T().CR.red, T().CR.bg, 0.55)); ctx.beginPath(); ctx.ellipse(360, 764, 120, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = WS.css(T().CR.brass, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(360, 764, 108, 7, 0, 0, Math.PI * 2); ctx.stroke();
    // painting above the desk
    box(ctx, 80, 616, 78, 54, 3, col('brassDk')); box(ctx, 84, 620, 70, 46, 2, WS.css(WS.mix(T().CR.blue, T().CR.bg, 0.5)));
    ctx.fillStyle = WS.css(WS.mix(T().CR.green, T().CR.bg, 0.4)); ctx.beginPath(); ctx.moveTo(84, 666); ctx.lineTo(110, 640); ctx.lineTo(128, 655); ctx.lineTo(154, 632); ctx.lineTo(154, 666); ctx.closePath(); ctx.fill();
    circle(ctx, 138, 632, 5, col('moon'));
    // front door with light behind it when opening
    const open = a && a.station === 'door' ? Math.sin(Math.PI * clamp(a.p * 1.15, 0, 1)) : 0;
    box(ctx, 328, 664, 64, 104, 6, col('woodDk'));
    if (open > 0) { box(ctx, 334, 670, 52, 98, 4, WS.css(T().CR.glow, 0.95)); glow(ctx, 360, 720, 90, T().CR.glow, 0.45 * open); }
    else box(ctx, 334, 670, 52, 98, 4, col('shellDk'));
    const dw = 52 * (1 - open * 0.75);
    box(ctx, 334, 670, dw, 98, 4, col('wood'));
    box(ctx, 340, 678, Math.max(0, dw - 12), 36, 3, col('woodHi')); box(ctx, 340, 722, Math.max(0, dw - 12), 38, 3, col('woodHi'));
    circle(ctx, 334 + dw - 7, 722, 2.5, col('brass'));
    // fireplace
    const fire = s.light.parlor > 0.05 && a && a.station === 'rest' ? 1 : 0.55;
    box(ctx, 404, 690, 60, 78, 4, col('shellDk')); box(ctx, 398, 684, 72, 8, 2, col('slab'));
    box(ctx, 414, 712, 40, 56, 14, WS.css(T().CR.black, 0.6));
    for (let i = 0; i < 4; i++) {
      const fl = Math.sin(s.now * 7 + i * 1.7) * 0.5 + 0.5, h = (18 + fl * 14) * fire;
      ctx.fillStyle = WS.css(i % 2 ? T().CR.fire : T().CR.flame, 0.9);
      ctx.beginPath(); ctx.ellipse(424 + i * 7, 764 - h / 2, 5, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    glow(ctx, 434, 744, 60 * fire + 10, T().CR.fire, 0.3 * fire);
    // armchair back (seat and arms are in the foreground)
    box(ctx, 446, 706, 50, 46, 12, WS.css(WS.mix(T().CR.magenta, T().CR.bg, 0.45)));
    // side table + plant
    box(ctx, 506, 736, 18, 4, 2, col('wood')); box(ctx, 513, 740, 4, 28, 1, col('woodDk'));
    box(ctx, 16, 742, 22, 26, 4, col('woodDk'));
    ctx.fillStyle = col('leaf'); for (const [dx, h] of [[-6, 34], [0, 46], [7, 30]]) { ctx.beginPath(); ctx.ellipse(27 + dx, 742 - h / 2, 5, h / 2, dx * 0.04, 0, Math.PI * 2); ctx.fill(); }
  }
  function desk(ctx, q) {
    box(ctx, 66, 724, 108, 10, 3, col('woodHi')); box(ctx, 70, 734, 100, 18, 3, col('wood'));
    ctx.fillStyle = col('woodDk'); ctx.fillRect(74, 752, 6, 16); ctx.fillRect(160, 752, 6, 16);
    box(ctx, 104, 718, 34, 8, 1, col('paper'));
    if (q != null) { ctx.fillStyle = WS.css(T().CR.ink, 0.8); const n = Math.floor(q * 3 * 26); for (let i = 0; i < n; i++) if (i % 9 !== 8) ctx.fillRect(107 + (i % 26), 720 + Math.floor(i / 26) * 2, 1, 1); }
    box(ctx, 148, 712, 6, 12, 2, col('ink')); box(ctx, 82, 716, 10, 8, 2, col('brassDk'));
  }
  function armchairFront(ctx) {
    const c = WS.mix(T().CR.magenta, T().CR.bg, 0.3);
    box(ctx, 450, 744, 42, 16, 6, WS.css(c));
    box(ctx, 440, 730, 12, 34, 6, WS.css(WS.mix(c, T().CR.black, 0.2))); box(ctx, 490, 730, 12, 34, 6, WS.css(WS.mix(c, T().CR.black, 0.2)));
    ctx.fillStyle = col('woodDk'); ctx.fillRect(446, 764, 4, 4); ctx.fillRect(492, 764, 4, 4);
  }
  function mug(ctx, x, y) { box(ctx, x - 4, y - 6, 8, 8, 2, col('cyan')); ctx.strokeStyle = col('cyan'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 5, y - 2, 3, -1.2, 1.2); ctx.stroke(); }

  /* ---------------- per-frame state for animations ---------------- */
  function acting(s, station) {
    for (const w of s.workers) if (w.cur && w.cur.stage === 'act' && w.cur.job.station === station) {
      return { p: clamp((s.now - w.cur.t0) / (WS.engine.ACT * w.cur.k), 0, 1), h: w.cur.job.h, station, w };
    }
    return null;
  }
  function furniture(ctx, s) {
    const lib = acting(s, 'bookshelf');
    library(ctx, s, lib && lib.p > 0.1 && lib.p < 0.9 ? lib.h % BOOKS.length : -1);
    workshopBack(ctx);
    const arc = acting(s, 'cabinet');
    let open = null;
    if (arc) { const a = arc.h % 4, b = (arc.h >>> 3) % 4; open = [arc.p < 0.6 ? a : -1, arc.p > 0.35 ? b : -1]; }
    archive(ctx, s, open);
    engine(ctx, s, acting(s, 'terminal'));
    const sc = acting(s, 'telescope');
    telescope(ctx, s, sc ? sc.p : null);
    const parlorAct = acting(s, 'door') || acting(s, 'rest');
    parlorBack(ctx, s, parlorAct);
    if (!acting(s, 'helper')) drone(ctx, 462, 150, s, col('glow'));
  }
  function foreground(ctx, s) {
    const wb = acting(s, 'workbench');
    draftingTable(ctx, wb ? wb.p : null);
    const dk = acting(s, 'desk');
    desk(ctx, dk ? dk.p : null);
    armchairFront(ctx);
    if (!s.workers.some(w => (w.cur && w.cur.stage === 'act' && w.cur.job.station === 'rest') || (!w.cur && w.at === 'rest'))) mug(ctx, 514, 734);
    const tm = acting(s, 'terminal');
    if (tm) steam(ctx, s, tm.p);
  }
  /* ---------------- postures ---------------- */
  function pose(p, w, s) {
    const a = p.anim, q = a.p, h = a.h;
    switch (a.station) {
      case 'bookshelf': p.face = 'U'; p.handR = [8, -42 - 6 * arcQ(q)]; p.handL = [-10, -18]; break;
      case 'workbench': { p.face = 'D'; const k = (q * 5) % 1; p.handR = [lerp(-10, 14, k), -22]; p.handL = [-12, -20]; break; }
      case 'cabinet': p.face = 'L'; p.handL = [-16, -24 - 4 * arcQ(q)]; p.handR = [-12, -20]; break;
      case 'terminal': { p.face = 'U'; const t = Math.floor(s.now * 10) % 2; p.handL = [-8, -24 - t * 2]; p.handR = [8, -26 + t * 2]; break; }
      case 'telescope': p.face = 'L'; if (q < 0.3) p.lookUp = true; else { p.handL = [-14, -34]; p.handR = [-8, -30]; } break;
      case 'helper': p.face = 'R'; p.handR = q > 0.1 && q < 0.4 ? [12, -44 + Math.sin(s.now * 12) * 4] : [10, -18]; break;
      case 'desk': { p.face = 'D'; p.sit = true; p.y = 742; const k = (q * 3) % 1; p.handR = [lerp(-14, 16, k), -18]; p.handL = [-14, -16]; break; }
      case 'door': p.face = q < 0.5 ? 'U' : 'D'; if (q >= 0.5) { p.handL = [-8, -26]; p.handR = [8, -26]; } break;
      case 'rest': {
        p.face = 'D'; p.sit = true; p.y = 752;
        const k = q == null ? ((s.now + w.n * 2.3) % 9) / 9 : q;
        const stretch = q == null ? k < 0.12 : q < 0.35, sip = q == null ? k > 0.45 && k < 0.6 : q > 0.6 && q < 0.85;
        if (stretch) { p.handL = [-14, -48]; p.handR = [14, -48]; p.blink = true; }
        else { p.handR = sip ? [3, -36] : [12, -20]; p.handL = [-12, -18]; if (sip) p.blink = true; p.mug = true; }
        break;
      }
    }
    void h;
  }
  function behind(ctx, p, w, s) {
    const a = p.anim;
    if (a.station === 'helper') {
      const q = a.p, up = arcQ(q), ang = q * Math.PI * 2;
      drone(ctx, 462 + Math.sin(ang) * 40 * up, 150 - up * 80 + Math.cos(ang) * 10 * up, s, p.coat.base);
    }
  }
  function front(ctx, p, w, s) {
    const a = p.anim, q = a.p;
    if (a.station === 'bookshelf' && q > 0.1 && q < 0.9) { // the book floats out and opens with glowing pages
      const b = BOOKS[a.h % BOOKS.length], t = ease(clamp((q - 0.1) / 0.3, 0, 1)), back = ease(clamp((q - 0.75) / 0.15, 0, 1));
      const x = lerp(lerp(b.x + b.w / 2, p.x + 22, t), b.x + b.w / 2, back), y = lerp(lerp(b.y + b.h / 2, p.y - 56, t), b.y + b.h / 2, back);
      const open = t * (1 - back);
      glow(ctx, x, y, 30 * open + 4, T().CR.glow, 0.5 * open);
      ctx.save(); ctx.translate(x, y);
      box(ctx, -b.w / 2 - 12 * open, -10, b.w + 24 * open, 20, 2, pal(b.c, b.t));
      if (open > 0.3) { box(ctx, -12 * open, -8, 11 * open, 16, 1, WS.css(T().CR.paper, open)); box(ctx, 1, -8, 11 * open, 16, 1, WS.css(T().CR.paper, open)); }
      ctx.restore();
    }
    if (a.station === 'cabinet') { // a card arcs from one cabinet drawer into the other
      const s0 = clamp((q - 0.15) / 0.6, 0, 1);
      if (s0 > 0 && s0 < 1) {
        const da = a.h % 4, db = (a.h >>> 3) % 4, e = ease(s0);
        const x = lerp(40, 152, e), y = lerp(drawerY(da) + 6, drawerY(db) + 6, e) - arcQ(e) * 50;
        glow(ctx, x, y, 14, T().CR.glow, 0.5);
        ctx.save(); ctx.translate(x, y); ctx.rotate((e - 0.5) * 0.8);
        box(ctx, -8, -5, 16, 10, 1.5, col('paper')); ctx.fillStyle = WS.css(T().CR.ac, 0.8); ctx.fillRect(-6, -3, 9, 1.5); ctx.fillRect(-6, 0, 12, 1.5);
        ctx.restore();
      }
    }
    if (a.station === 'door' && q >= 0.5) { // walks back in holding a glowing letter
      const x = p.x, y = p.y - 30;
      glow(ctx, x, y, 16, T().CR.glow, 0.5);
      box(ctx, x - 10, y - 6, 20, 13, 2, col('paper'));
      ctx.strokeStyle = WS.css(T().CR.ink, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 10, y - 6); ctx.lineTo(x, y + 1); ctx.lineTo(x + 10, y - 6); ctx.stroke();
      circle(ctx, x, y + 2, 2.5, col('red'));
    }
    if (a.station === 'rest' && p.mug) {
      const mx = p.x + p.handR[0], my = p.y + p.handR[1];
      mug(ctx, mx, my);
      if (!p.blink) for (let i = 0; i < 3; i++) { const t = (s.now * 0.6 + i / 3) % 1; ctx.fillStyle = WS.css(T().CR.fg, 0.4 * (1 - t)); ctx.beginPath(); ctx.arc(mx + Math.sin(t * 6 + i) * 3, my - 8 - t * 16, 2 + t * 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  WS.rooms = { furniture, foreground, pose, behind, front, BOOKS };
})(window.WS = window.WS || {});
