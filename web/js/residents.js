// Residents (smooth rounded characters in session-colored coats) and their speech bubbles.
'use strict';
(function (WS) {
  const { rr, glow } = WS.g;
  const T = () => WS.theme;
  const col = (k, a = 1) => WS.css(T().CR[k], a);

  function limb(ctx, x0, y0, x1, y1, w, c) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  // p: {x, y (feet), face L|R|U|D, sit, lookUp, blink, walk (distance walked or null), handL/handR [dx,dy] | null, coat}
  function drawResident(ctx, p, s) {
    const x = p.x, f = p.face, c = p.coat, side = f === 'L' || f === 'R';
    const phase = p.walk != null ? p.walk / 7 : 0, walking = p.walk != null;
    const bob = walking ? -Math.abs(Math.sin(phase)) * 1.6 : 0;
    const y = p.y + bob;
    // shadow
    if (!p.sit) { ctx.fillStyle = WS.css(T().CR.black, 0.28); ctx.beginPath(); ctx.ellipse(x, p.y, 11, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    // legs
    const trouser = WS.css(WS.mix(T().CR.bg, T().CR.fg, 0.22)), shoe = WS.css(WS.mix(T().CR.bg, T().CR.black, 0.3));
    if (p.sit) {
      rr(ctx, x - 9, y - 14, 8, 8, 3); ctx.fillStyle = trouser; ctx.fill();
      rr(ctx, x + 1, y - 14, 8, 8, 3); ctx.fill();
      rr(ctx, x - 9, y - 7, 8, 5, 2); ctx.fillStyle = shoe; ctx.fill();
      rr(ctx, x + 1, y - 7, 8, 5, 2); ctx.fill();
    } else {
      const sw = walking ? Math.sin(phase) * 3.5 : 0;
      limb(ctx, x - 4, y - 14, x - 4 + (side ? sw : 0), y - 3 - (walking && sw > 0 ? 1.5 : 0), 5, trouser);
      limb(ctx, x + 4, y - 14, x + 4 - (side ? sw : 0), y - 3 - (walking && sw < 0 ? 1.5 : 0), 5, trouser);
      for (const [lx, up] of [[x - 4 + (side ? sw : 0), walking && sw > 0], [x + 4 - (side ? sw : 0), walking && sw < 0]]) {
        rr(ctx, lx - 3.5 + (f === 'L' ? -1.5 : f === 'R' ? 1.5 : 0), y - 4 - (up ? 1.5 : 0), 7, 4, 2); ctx.fillStyle = shoe; ctx.fill();
      }
    }
    // coat: flared, with a soft side shade
    const top = y - 33, hem = y - (p.sit ? 9 : 11), sh = side ? 7 : 9, fl = side ? 9 : 12;
    const g = ctx.createLinearGradient(x - fl, 0, x + fl, 0);
    g.addColorStop(0, c.light); g.addColorStop(0.45, c.base); g.addColorStop(1, c.dark);
    ctx.beginPath();
    ctx.moveTo(x - sh, top + 2); ctx.quadraticCurveTo(x - sh, top, x - sh + 3, top);
    ctx.lineTo(x + sh - 3, top); ctx.quadraticCurveTo(x + sh, top, x + sh, top + 2);
    ctx.lineTo(x + fl, hem - 2); ctx.quadraticCurveTo(x + fl, hem, x + fl - 3, hem);
    ctx.lineTo(x - fl + 3, hem); ctx.quadraticCurveTo(x - fl, hem, x - fl, hem - 2);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    if (f === 'D') {
      ctx.fillStyle = col('paper'); ctx.beginPath(); ctx.moveTo(x - 4, top); ctx.lineTo(x + 4, top); ctx.lineTo(x, top + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.dark; ctx.beginPath(); ctx.moveTo(x - 1.5, top + 3); ctx.lineTo(x + 1.5, top + 3); ctx.lineTo(x, top + 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.light; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 5, top); ctx.lineTo(x - 1, top + 14); ctx.moveTo(x + 5, top); ctx.lineTo(x + 1, top + 14); ctx.stroke();
      for (const by of [top + 16, top + 20]) { ctx.fillStyle = col('brass'); ctx.beginPath(); ctx.arc(x, by, 1.1, 0, Math.PI * 2); ctx.fill(); }
      glow(ctx, x - 6, top + 5, 5, T().CR.glow, 0.7); ctx.fillStyle = col('glow'); ctx.beginPath(); ctx.arc(x - 6, top + 5, 1.3, 0, Math.PI * 2); ctx.fill();
    } else if (f === 'U') {
      ctx.strokeStyle = c.dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, top + 3); ctx.lineTo(x, hem - 1); ctx.stroke();
    }
    // arms
    const swing = walking ? Math.sin(phase) * 2.5 : 0;
    const hl = p.handL || [-11, -15 + swing], hr = p.handR || [11, -15 - swing];
    const arm = (sx, h) => { limb(ctx, sx, top + 4, x + h[0], y + h[1], 4.5, c.dark); ctx.fillStyle = col('skin'); ctx.beginPath(); ctx.arc(x + h[0], y + h[1], 2.6, 0, Math.PI * 2); ctx.fill(); };
    if (f === 'R') { arm(x - sh + 2, hl); } else if (f === 'L') { arm(x + sh - 2, hr); }
    else { arm(x - sh + 1, hl); arm(x + sh - 1, hr); }
    // head
    const hy = top - 9, ey = hy + 1 - (p.lookUp ? 1.5 : 0);
    ctx.fillStyle = col('skin'); ctx.beginPath(); ctx.arc(x, hy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col('hair');
    if (f === 'U') { ctx.beginPath(); ctx.arc(x, hy, 9.4, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.arc(x, hy - 1, 9.6, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(x + 4, hy - 6, x - 9.4, hy - 2); ctx.fill();
      if (f === 'L') { ctx.beginPath(); ctx.ellipse(x + 5, hy - 1, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      if (f === 'R') { ctx.beginPath(); ctx.ellipse(x - 5, hy - 1, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      const eyes = f === 'D' ? [x - 3.6, x + 3.6] : f === 'L' ? [x - 4.5] : [x + 4.5];
      for (const ex of eyes) {
        if (p.blink) { ctx.strokeStyle = col('ink'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex - 1.8, ey + 0.5); ctx.lineTo(ex + 1.8, ey + 0.5); ctx.stroke(); }
        else { ctx.fillStyle = col('ink'); ctx.beginPath(); ctx.ellipse(ex, ey, 1.6, 2.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col('white'); ctx.beginPath(); ctx.arc(ex - 0.5, ey - 0.8, 0.6, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = WS.css(T().CR.cheek, 0.5);
      if (f === 'D') { ctx.beginPath(); ctx.arc(x - 5.5, ey + 3.5, 1.7, 0, Math.PI * 2); ctx.arc(x + 5.5, ey + 3.5, 1.7, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(f === 'L' ? x - 3 : x + 3, ey + 3.5, 1.6, 0, Math.PI * 2); ctx.fill(); }
      if (f === 'D') { ctx.strokeStyle = WS.css(T().CR.ink, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, ey + 3.4, 1.8, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    }
    if (f === 'R') arm(x + sh - 2, hr); else if (f === 'L') arm(x - sh + 2, hl);
  }

  /* ---------------- speech bubbles ---------------- */
  const FONT = '500 11px ui-sans-serif, system-ui, sans-serif', LH = 14, PAD = 7, MAXW = 172;
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    const fits = t => ctx.measureText(t).width <= maxW;
    for (let wd of words) {
      while (!fits(wd)) { // break a word that is wider than a whole line
        let cut = wd.length - 1;
        while (cut > 1 && !fits(wd.slice(0, cut) + '-')) cut--;
        const head = wd.slice(0, cut) + '-';
        if (line) { lines.push(line); line = ''; }
        lines.push(head); wd = wd.slice(cut);
      }
      const cand = line ? line + ' ' + wd : wd;
      if (fits(cand)) line = cand; else { lines.push(line); line = wd; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.length > 1 && !fits(last + '…')) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + '…';
    }
    return lines;
  }
  const overlap = (a, b) => a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + b.h + 3 && b.y < a.y + a.h + 3;
  // list: [{x, y (bottom anchor above the head), text, color}]
  function drawBubbles(ctx, list) {
    const L = WS.layout, CR = T().CR;
    ctx.font = FONT; ctx.textBaseline = 'middle';
    const placed = [];
    for (const b of list) {
      const lines = wrap(ctx, b.text, MAXW, 2);
      const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + PAD * 2 + 8, h = lines.length * LH + PAD * 2 - 2;
      const box = { x: Math.max(6, Math.min(L.W - 6 - w, b.x - w / 2)), y: b.y - h - 6, w, h };
      const home = box.y;
      for (let i = 0; i < 20; i++) {
        box.y = Math.max(4, Math.min(L.CAPTION.y0 - 8 - h, home + Math.ceil(i / 2) * (h + 5) * (i % 2 ? -1 : 1)));
        if (!placed.some(o => overlap(o, box))) break;
      }
      placed.push(box);
      const moved = box.y !== Math.max(4, Math.min(L.CAPTION.y0 - 8 - h, home));
      ctx.fillStyle = WS.css(CR.black, 0.25); rr(ctx, box.x + 1, box.y + 2, w, h, 8); ctx.fill();
      ctx.fillStyle = WS.css(WS.mix(CR.bg, CR.black, 0.15), 0.94); rr(ctx, box.x, box.y, w, h, 8); ctx.fill();
      ctx.strokeStyle = b.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.2; rr(ctx, box.x, box.y, w, h, 8); ctx.stroke(); ctx.globalAlpha = 1;
      if (!moved) {
        const tx = Math.max(box.x + 10, Math.min(box.x + w - 10, b.x));
        ctx.fillStyle = WS.css(WS.mix(CR.bg, CR.black, 0.15), 0.94);
        ctx.beginPath(); ctx.moveTo(tx - 5, box.y + h - 0.5); ctx.lineTo(tx, box.y + h + 6); ctx.lineTo(tx + 5, box.y + h - 0.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = b.color; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(tx - 5, box.y + h); ctx.lineTo(tx, box.y + h + 6); ctx.lineTo(tx + 5, box.y + h); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(box.x + PAD + 2, box.y + PAD + 6, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WS.css(CR.fg, 0.95);
      lines.forEach((l, i) => ctx.fillText(l, box.x + PAD + 9, box.y + PAD + 6 + i * LH));
    }
  }
  WS.drawResident = drawResident;
  WS.drawBubbles = drawBubbles;
  WS.wrapText = wrap;
})(window.WS = window.WS || {});
