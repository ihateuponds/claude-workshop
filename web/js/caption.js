// Caption panel: what is happening right now, in big words, and a one-line summary of today.
'use strict';
(function (WS) {
  const SUMMARY_WORDS = { cabinet: 'moved', workbench: 'edited', bookshelf: 'read', telescope: 'web', helper: 'helpers',
    terminal: 'commands', desk: 'other', rest: 'done', door: 'tasks' };
  const ONE = { helper: 'helper', terminal: 'command', door: 'task' };
  function summary(counts) {
    return Object.keys(SUMMARY_WORDS).filter(k => counts[k] > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 4)
      .map(k => `${counts[k]} ${counts[k] === 1 ? (ONE[k] || SUMMARY_WORDS[k]) : SUMMARY_WORDS[k]}`).join('  ·  ');
  }
  // focus: {color, text, station} | null
  function drawCaption(ctx, s, focus) {
    const L = WS.layout, CR = WS.theme.CR, y0 = L.CAPTION.y0, W = L.W;
    const g = ctx.createLinearGradient(0, y0, 0, L.H);
    g.addColorStop(0, WS.css(WS.mix(CR.bg, CR.black, 0.15))); g.addColorStop(1, WS.css(WS.mix(CR.bg, CR.black, 0.45)));
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, L.H - y0);
    const edge = ctx.createLinearGradient(0, 0, W, 0);
    edge.addColorStop(0, WS.css(CR.ac, 0)); edge.addColorStop(0.5, WS.css(CR.ac, s.anyLit ? 0.8 : 0.35)); edge.addColorStop(1, WS.css(CR.ac, 0));
    ctx.fillStyle = edge; ctx.fillRect(0, y0, W, 2);

    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = WS.css(CR.ac, 0.85);
    ctx.fillText('NOW', 28, y0 + 30);

    let text = 'Waiting for a task', dot = WS.css(CR.fg, 0.35), dim = true;
    if (focus) {
      dim = false; dot = focus.color;
      text = focus.station === 'rest' ? 'Resting — all done' : focus.text;
    }
    ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
    const lines = WS.wrapText(ctx, text, W - 80, 2);
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(34, y0 + 56, 6, 0, Math.PI * 2); ctx.fill();
    if (!dim && focus.rgb) WS.g.glow(ctx, 34, y0 + 56, 16, focus.rgb, 0.35);
    ctx.fillStyle = WS.css(CR.fg, dim ? 0.5 : 0.96);
    lines.forEach((l, i) => ctx.fillText(l, 52, y0 + 64 + i * 28));

    ctx.fillStyle = WS.css(CR.fg, 0.08); ctx.fillRect(28, y0 + 128, W - 56, 1);
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = WS.css(CR.ac, 0.85); ctx.fillText('TODAY', 28, y0 + 156);
    ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = WS.css(CR.fg, 0.8);
    ctx.fillText(summary(s.counts) || 'nothing yet', 80, y0 + 156);
  }
  WS.drawCaption = drawCaption;
  WS.captionSummary = summary;
})(window.WS = window.WS || {});
