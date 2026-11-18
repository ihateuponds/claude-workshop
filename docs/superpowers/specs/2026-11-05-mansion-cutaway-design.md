# Mansion cutaway redesign: design

Date: 2026-11-05 · Status: approved in chat, spec awaiting review
Replaces the pixel-art scene (`web/scene.js`). Hook, server API, event format and launcher are unchanged except where noted.

## Goal

Ponds wants the whole dashboard redesigned: a smooth (not pixel-art) cutaway of a "mind mansion" where every room is a kind of work, so a glance at the Sceptre shows what Claude is doing, where, and what got done today. Style: flat vector with soft glow (clean shapes, gentle gradients, glowing light). Inspired by the feel of VisionQuest's mindspace mansion, but original: no Marvel characters, logos or Mind Stone.

## Decisions (from Ponds)

- Direction: mansion cutaway, rooms = jobs (picked over "scene + story strip" and "plain dashboard").
- "Less pixel art and more fluid": vector shapes, anti-aliased, eased motion, drawn at the screen's real resolution.
- Style: flat vector, soft glow.
- Keep: plain-English `doing` sentences, the brief "today" summary, privacy rules, backlog cap, `claude-workshop` launcher.

## Screen layout

Logical canvas 540×960 (portrait), drawn with Canvas 2D vector paths and scaled by `fitScale × devicePixelRatio` so it is crisp at 1080×1920. Bands (logical units):

| y | Band | Contents |
|---|---|---|
| 0–170 | Roof | Observatory dome + telescope (web), drone pad (helper), night sky |
| 170–370 | Floor 3 | Library (left: reading/searching) · Workshop (right: editing/writing) |
| 370–570 | Floor 2 | Archive (left: moving files) · Engine room (right: commands) |
| 570–780 | Floor 1 | Parlor: front door (new task), writing desk (other tools), fireplace + armchair (done/rest) |
| 780–960 | Caption | Big "now" sentence with the resident's color dot; one-line brief "today" summary |

Rooms: left x 0–240, right x 300–540; the elevator shaft is x 240–300 and spans roof to parlor.

## Station mapping (event `station` → place)

| station | Room | Animation |
|---|---|---|
| bookshelf | Library | a book slides out, floats open, pages glow |
| workbench | Workshop | glowing lines draw onto a blueprint on the drafting table |
| cabinet | Archive | a card arcs from one drawer into another |
| terminal | Engine room | gears turn, gauges swing, a steam puff rises |
| telescope | Observatory | dome slit opens, telescope swings, a star sparkles |
| helper | Roof pad | a drone lifts off, circles, lands |
| desk | Parlor desk | resident writes; paper fills with lines |
| door | Parlor door | door opens with light; resident walks in holding a letter |
| rest | Parlor fire | resident sits in the armchair; fire grows; idle stretch/sip |

## Motion

- Residents move on their floor by walking; between floors they walk to the shaft door, ride the glass elevator (eased vertical motion), and walk out. Path = [current spot → shaft door (current floor) → shaft door (target floor) → station]; same floor = direct.
- Walking speed ~110 logical px/s, elevator ~260 px/s with ease-in-out; acting time 1.2 s per event (sped up by the existing queue factor when the queue is long). Queue cap 15 / collapse to 3 on tab visible, as today.

## Rooms and light

- Each room has a nameplate ("Library · 9" = today's count). Plate brightens for 1 s when its count rises.
- Unused rooms are dim (dark overlay ~45%); the room being used is lit with a warm radial glow that fades in/out over 0.4 s.
- Circuits: thin glowing lines run from each room through the walls to a core in the shaft; the active room's line carries a moving pulse into the core; the core brightens while anything is active.
- Mind touches: subtle wallpaper pattern per room; every ~10 s a soft "ripple" (a 0.2 s horizontal band offset with a faint cyan/magenta edge).

## Residents

- Smooth rounded characters (~46 logical px tall): coat in the session's palette color, lighter collar, head with hair and simple eyes that blink, eased walk bob, arms posed per animation, sitting pose.
- Speech bubble: rounded rectangle near the head with the `doing` sentence (max 2 lines × 30 chars, ellipsis), never overlapping another bubble (nudge, as today).
- Multiple sessions = multiple residents, each its own coat color. Idle 10 min → walks out the front door.

## Caption panel

- Line 1–2 (large, ~22 px logical): color dot + the most recent resident's current `doing` sentence (or "Resting — all done" / "Waiting for a task").
- Line 3 (small): brief today summary, biggest first, up to 4 items: `12 moved · 5 edited · 9 read · 20 commands`.

## Code structure

Classic scripts sharing one namespace `window.WS` (no ES modules, so `file://` headless renders keep working):

| File | Responsibility |
|---|---|
| `web/index.html` | one `<canvas id="scene">`, loads the scripts in order |
| `web/js/theme.js` | `WS.theme`: palette from `/theme` (or fallback/`?theme=`), derived shades, `WS.mix`, `WS.css` |
| `web/js/layout.js` | `WS.layout`: bands, rooms, station spots, shaft doors, `pathTo(from, station)` |
| `web/js/engine.js` | `WS.engine`: workers, queue, push/collapse/counts/flash, clock-driven `update(dt)`; no drawing |
| `web/js/house.js` | `WS.drawHouse(ctx, state)`: structure, rooms, lights, nameplates, circuits, core, sky, ripple |
| `web/js/rooms.js` | `WS.rooms[station](ctx, p, ...)`: per-room furniture + its event animation |
| `web/js/residents.js` | `WS.drawResident`, `WS.drawBubbles` |
| `web/js/caption.js` | `WS.drawCaption(ctx, state)` |
| `web/js/main.js` | canvas sizing, loop, `?static/?demo/?at/?theme`, SSE, theme refresh, `window.workshop` |

`server.py`: serve `/js/<name>.js` where name matches `^[a-z][a-z0-9-]*$` from `web/js/`, plus `/` (others 404). Old `web/scene.js` removed (archived by git history).

## Testing

- `tests/test_server.py`: `/js/engine.js` served with JS content type; `/js/../server.py` and `/js/Bad.js` 404.
- `tests/scene_logic.test.js` (`node --test`): layout `pathTo` goes through the shaft for cross-floor moves and direct on the same floor; engine counts each event once incl. collapse; unknown/prototype station names fall back safely; queue cap.
- `tests/render_scene.sh`: headless stills for demos `all`, `burst`, `two`, `close` (existing names), fail on missing PNG or `Uncaught`; looked at by eye in both the fallback and Singularity themes.

## Out of scope

Sound, click interactions, history replay, per-session rooms.

## Undo

`git revert` the redesign commits (old scene returns), reload the window.
