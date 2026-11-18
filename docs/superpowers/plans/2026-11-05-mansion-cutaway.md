# Mansion Cutaway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pixel-art scene with a smooth, flat-vector "mind mansion" cutaway where each room is a kind of work, plus a caption panel.

**Architecture:** Classic scripts sharing `window.WS`, drawn with Canvas 2D vector paths on a 540×960 logical canvas scaled to device pixels. Logic (`layout`, `engine`) is pure and node-testable; drawing files only read state. The server additionally serves `web/js/*.js`.

**Tech Stack:** Vanilla JS (no deps, no modules, no build), Canvas 2D, Python stdlib server, `node --test`, headless chromium stills.

**Spec:** `docs/superpowers/specs/2026-11-05-mansion-cutaway-design.md`

## Global Constraints

- No dependencies, no ES modules (scripts must work from `file://`), no external assets/fonts/CDNs; use the system sans-serif font stack `ui-sans-serif, system-ui, sans-serif` for text.
- Logical canvas 540×960; backing store = logical × fitScale × devicePixelRatio; all drawing in logical units via `ctx.setTransform`.
- Every color derives from the theme (`background, foreground, accent, palette[6]`); fallback theme exactly: `#1a1b26`, `#c0caf5`, `#7aa2f7`, `["#f7768e","#9ece6a","#e0af68","#7aa2f7","#bb9af7","#7dcfff"]`.
- Event record in: `{t, session, event, station, label, doing}`; stations `cabinet, workbench, bookshelf, telescope, helper, terminal, desk, rest, door`; unknown or prototype-key stations → `workbench` (`Object.hasOwn`).
- Text shown is `doing ?? label`, rendered with `fillText` only (never innerHTML).
- Queue cap 15, collapse to 3 on `visibilitychange`→visible, every event counted exactly once; idle 600 s → resident leaves by the front door.
- Params kept: `?static=1`, `?demo=all|burst|two|close`, `?at=<ms>` (deterministic fixed-step still), `?theme=bg,fg,accent,r,g,y,b,m,c`, `?log=1`; `window.workshop.push/state` kept.
- Renders only to the session scratchpad; never screenshot the desktop.

## Review Focus

1. Cross-floor move while the elevator is "in use" by another resident → both still arrive (no shared elevator lock; each rides its own car position) — Task 2 test `two residents cross floors at once`.
2. Many events while hidden then visible → counts exact, queue ≤ 3 — Task 2 test `collapse keeps counts exact`.
3. Very long `doing` (60 chars, one 40-char word) → bubble and caption wrap/ellipsize inside bounds — Task 5/6 render check with demo label of that shape.
4. Window resized (not 9:16) → scene letterboxes, stays crisp, no stretching — Task 3 render at `--window-size=1000,1920` and `1080,1700`.
5. Theme with very dark background (Singularity) → dim rooms still distinguishable, text contrast ok — every render task also renders with `THEME=050b08,c9ddce,59d98b,ec8181,59c981,d8c07e,86b3d1,b4a0d2,77cbb5`.

---

### Task 1: Server serves `web/js/*.js`

**Files:** Modify `server.py`; Test `tests/test_server.py`

- [ ] Tests: `test_js_served` (create `web/js/engine.js` stub if absent; GET `/js/engine.js` → 200, `Content-Type` starts `text/javascript`); `test_js_rejects_bad_names` (`/js/../server.py`, `/js/Bad.js`, `/js/a.txt`, `/js/` → 404).
- [ ] Run → FAIL. Implement: route `/js/<name>.js` with `^[a-z][a-z0-9-]*$`, file must exist in `web/js/`. Keep `/` and drop `/scene.js` once Task 6 removes it (leave it for now).
- [ ] Full `python -m unittest` → PASS. Commit `feat: serve web/js scripts`.

### Task 2: Foundation — theme, layout, engine (+ node tests)

**Files:** Create `web/js/theme.js`, `web/js/layout.js`, `web/js/engine.js`, `tests/scene_logic.test.js`

**Interfaces (produced):**
- `WS.theme.set(t)`, `WS.theme.C` (css strings), `WS.theme.CR` (rgb arrays), `WS.mix(a,b,t)`, `WS.css(rgb)`, `WS.theme.coat(n) → {base, dark, light}` (palette[n % 6] based), `WS.theme.fromParam(str)`.
- `WS.layout`: `{W:540, H:960, SHAFT:{x0:240,x1:300}, FLOORS:{roof:{y0:0,y1:170,floorY:160}, f3:{y0:170,y1:370,floorY:358}, f2:{y0:370,y1:570,floorY:558}, f1:{y0:570,y1:780,floorY:768}}, ROOMS:{library:{floor:'f3',x0:0,x1:240,station:'bookshelf'}, workshop:{floor:'f3',x0:300,x1:540,station:'workbench'}, archive:{floor:'f2',x0:0,x1:240,station:'cabinet'}, engine:{floor:'f2',x0:300,x1:540,station:'terminal'}, observatory:{floor:'roof',x0:0,x1:300,station:'telescope'}, pad:{floor:'roof',x0:300,x1:540,station:'helper'}, parlor:{floor:'f1',x0:0,x1:540,stations:['door','desk','rest']}}, SPOTS:{station → {x, floor, face}}, ENTRY:{x:270, floor:'f1', outside:true}}`, `shaftDoor(floor) → {x:270, y}`, `pathTo(from:{x,floor}, station) → [{x, floor, ride?:true}]`.
  - Spots (x, face): bookshelf 90 U, workbench 420 D, cabinet 80 L, terminal 430 U, telescope 120 L, helper 420 R, desk 120 D, rest 430 D, door 270 D (the front door is at the parlor's bottom center; residents enter from below the floor line, ENTRY).
- `WS.engine`: `create({now?})` → state `{now, workers[], counts{}, flash{}}`; `push(state, ev)`; `update(state, dt, wallNow)`; `collapse(w, keep)`; worker `{session, n, x, floor, y (derived), face, queue[], cur, at, last, lastWall, done, lastLabel}`; `cur.stage ∈ walk|ride|act|leave`. Constants `WALK=110, LIFT=260, ACT=1.2, QUEUE_MAX=15, QUEUE_RESUME=3, IDLE_LEAVE=600`. Ride uses ease-in-out over the vertical distance.

- [ ] Tests (`node --test tests/scene_logic.test.js`, load the three files into a `vm` context with a fake `window`): `pathTo same floor is direct`; `pathTo cross floor rides the shaft` (contains a `ride` step at x 270 between the two floors); `prototype station falls back to workbench`; `each event counted once` (push 20, run update until idle, sum counts = 20); `collapse keeps counts exact` (push 500 before any update, counts + queued = 500 after collapse to 15; after `collapse(w,3)` same invariant); `two residents cross floors at once` (two sessions, both to library from parlor, both reach `act`); `idle resident leaves` (advance 601 s → worker removed after walking out).
- [ ] Run → FAIL; implement; run → PASS (also `python -m unittest`). Commit `feat: mansion layout and engine`.

### Task 3: House drawing + main loop

**Files:** Create `web/js/house.js`, `web/js/main.js`; Modify `web/index.html` (load `js/theme.js, layout.js, engine.js, house.js, rooms.js, residents.js, caption.js, main.js`; one canvas `#scene`; black letterbox); create empty-but-valid `rooms.js`, `residents.js`, `caption.js` stubs exporting no-op functions so the page runs.

**Interfaces:** `WS.drawHouse(ctx, s)` where `s = {now, lit:Set<station>, counts, flash, theme}`; `main.js` owns sizing (`fit()` → letterbox, `setTransform(scale*dpr,…)`), loop (rAF re-armed first, try/catch log-once), `?at` fixed 60 Hz steps, demos (port `demoScript` incl. `close` and the long-label case), SSE `counts` seeding (subtract queued + walking/riding), `/theme` every 30 s, `window.workshop`.

- [ ] House draws: night sky + stars + moon; roof with observatory dome (slit opens with `lit.has('telescope')`) and drone pad; outer walls, floors as thick slabs with soft shadow; each room's wallpaper (subtle pattern, distinct hue per room from palette mixed into bg) and window; elevator shaft with glass car rails and the core (soft radial glow, brighter when any lit); circuits from each room to the core with a moving pulse on lit ones; dim overlay on unlit rooms (alpha 0.45 fading over 0.4 s); nameplates "Library · 9" (rounded plate, brightens 1 s on flash); parlor front door at bottom center; ripple every ~10 s for 0.2 s.
- [ ] Update `tests/render_scene.sh` shots to the new demo timings you choose; add the two odd window sizes (Review Focus 4). Render both themes; look at each PNG. Commit `feat: mansion house and main loop`.

### Task 4: Rooms — furniture and per-event animations

**Files:** Fill `web/js/rooms.js`

**Interfaces:** `WS.rooms.furniture(ctx, s)` draws all static furniture; `WS.rooms.anim[station](ctx, p, worker, s)` draws the event animation for progress `p ∈ [0,1]` and may set `pose` hints on the worker (`handL, handR, face, sit, lookUp`).

- [ ] Furniture: library shelves + reading lamp; workshop drafting table with blueprint + stool; archive two drawer cabinets; engine room machine with gears, gauges, pipes; observatory telescope on a mount; pad with landing ring; parlor door, writing desk + chair, fireplace + armchair + side table. Smooth shapes with gentle gradients.
- [ ] Animations exactly as in the spec's station table. Render `all` at a moment inside each station's act (9 stills) in both themes; look at each.
- [ ] Commit `feat: mansion rooms and animations`.

### Task 5: Residents and bubbles

**Files:** Fill `web/js/residents.js`

**Interfaces:** `WS.drawResident(ctx, w, pose, s)`; `WS.drawBubbles(ctx, list)` with `list = [{x, y, text, color}]`, wrapping to 2 lines × 30 chars with ellipsis, rounded-rect bubble with tail, collision nudge (no overlaps, tail hidden when nudged).

- [ ] Resident: ~46 px tall rounded body; coat `WS.theme.coat(n)`; collar; head, hair, eyes (blink), cheeks; walk bob + leg swing; sit pose; riding pose (still, in the glass car); face L/R/U/D. Render `two` and `close` (incl. the long-label case) in both themes; look.
- [ ] Commit `feat: smooth residents and speech bubbles`.

### Task 6: Caption panel, cleanup, final checks

**Files:** Fill `web/js/caption.js`; Delete `web/scene.js`; Modify `server.py` (drop `/scene.js` route), `tests/test_server.py` (index test still finds `<canvas`), `README.md` (describe the mansion), `tests/render_scene.sh`.

**Interfaces:** `WS.drawCaption(ctx, s)` using `s.focus = {color, text} | null` (main.js picks the resident whose `cur` started most recently, else the most recent `lastLabel` within 4 s, else null) and `s.counts`.

- [ ] Caption: panel with soft top edge; line 1–2 large text with color dot (`Resting — all done` when the last event was `rest`, `Waiting for a task` when no residents); line 3 small summary `12 moved · 5 edited · 9 read · 20 commands` (biggest first, up to 4; words: moved, edited, read, web, helpers, commands, other, done, tasks).
- [ ] `python -m unittest`, `node --test tests/scene_logic.test.js`, `bash tests/render_scene.sh` (both themes) all green; look at caption in `all`, `burst`, `two`.
- [ ] Commit `feat: caption panel; remove pixel scene`.
