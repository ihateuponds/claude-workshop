// Theme: every color in the mansion derives from the Omarchy theme (or the fallback / ?theme= override).
'use strict';
(function (WS) {
  const FALLBACK = { background: '#1a1b26', foreground: '#c0caf5', accent: '#7aa2f7',
    palette: ['#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff'] };
  function rgb(s) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s ?? '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (c, a = 1) => a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const K = [0, 0, 0], WH = [255, 255, 255];
  const T = { CR: {}, C: {}, PAL: [] };
  function set(t) {
    t = t || {};
    const pick = (v, d) => rgb(v) || rgb(d);
    const bg = pick(t.background, FALLBACK.background), fg = pick(t.foreground, FALLBACK.foreground);
    const ac = pick(t.accent, FALLBACK.accent);
    const pal = FALLBACK.palette.map((d, i) => pick(Array.isArray(t.palette) ? t.palette[i] : null, d));
    const [red, green, yellow, blue, magenta, cyan] = pal;
    const wood = mix(mix(yellow, red, 0.35), bg, 0.5);
    const CR = {
      bg, fg, ac, red, green, yellow, blue, magenta, cyan, white: WH, black: K,
      sky: mix(bg, blue, 0.18), skyTop: mix(bg, K, 0.35), star: mix(fg, WH, 0.6), moon: mix(yellow, WH, 0.6),
      shell: mix(bg, fg, 0.1), shellDk: mix(bg, K, 0.3), slab: mix(bg, fg, 0.2), slabDk: mix(bg, fg, 0.08),
      wood, woodDk: mix(wood, bg, 0.45), woodHi: mix(wood, fg, 0.2),
      brass: mix(yellow, fg, 0.15), brassDk: mix(yellow, bg, 0.45),
      metal: mix(mix(fg, blue, 0.3), bg, 0.45), metalDk: mix(mix(fg, blue, 0.3), bg, 0.7), metalHi: mix(fg, WH, 0.2),
      glass: mix(cyan, WH, 0.3), glow: mix(ac, WH, 0.35), core: mix(ac, WH, 0.15),
      paper: mix(fg, WH, 0.55), ink: mix(bg, blue, 0.2),
      skin: mix(mix(red, yellow, 0.55), WH, 0.45), cheek: mix(red, WH, 0.35), hair: mix(mix(yellow, red, 0.5), bg, 0.55),
      fire: mix(red, yellow, 0.4), flame: mix(yellow, WH, 0.35), leaf: mix(green, bg, 0.25),
      // room wallpaper: each room gets its own hue, kept dark
      wallLibrary: mix(bg, mix(green, yellow, 0.3), 0.2), wallWorkshop: mix(bg, blue, 0.22),
      wallArchive: mix(bg, magenta, 0.18), wallEngine: mix(bg, red, 0.16), wallParlor: mix(bg, yellow, 0.16),
      wallRoof: mix(bg, cyan, 0.1),
    };
    const C = {};
    for (const k in CR) C[k] = css(CR[k]);
    T.CR = CR; T.C = C; T.PAL = pal;
    if (typeof document !== 'undefined' && document.body) document.body.style.background = css(mix(bg, K, 0.5));
  }
  // A resident's coat: base, dark and light shades of palette color n.
  function coat(n) {
    const c = T.PAL[n % 6], bg = T.CR.bg;
    return { base: css(c), dark: css(mix(c, bg, 0.4)), light: css(mix(c, WH, 0.35)), rgb: c };
  }
  function fromParam(p) {
    if (!p) return null;
    const v = p.split(',').map(s => '#' + s.replace(/^#/, '').trim());
    return { background: v[0], foreground: v[1], accent: v[2], palette: v.slice(3, 9) };
  }
  WS.mix = mix; WS.css = css; WS.rgb = rgb;
  WS.theme = Object.assign(T, { FALLBACK, set, coat, fromParam });
  set(FALLBACK);
})(window.WS = window.WS || {});
