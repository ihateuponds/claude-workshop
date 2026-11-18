# Claude Workshop: design

Date: 2026-11-04 · Status: approved in chat, spec awaiting review

## Goal

Ponds wants something to look at while Claude works (organizing downloads,
moving files, building things) instead of only code output. Success: Ponds
runs `claude-workshop`, a pixel-art workshop opens on the vertical Sceptre
monitor, and a little worker visibly acts out what Claude is doing, live.

## Decisions (from Ponds)

- Style: living scene, a cozy pixel-art workshop.
- Placement: its own window on the Sceptre (HDMI-A-1, 1080x1920 portrait,
  workspaces 8-10). Opens only when Ponds launches it (contract rule 3.9).
- Colors follow the current Omarchy theme.

## Architecture

Three small units, Python stdlib + one HTML page, no installed deps.

```
Claude Code hooks ──> workshop-hook ──> events.jsonl ──> workshop-server ──SSE──> page (canvas)
```

### 1. `workshop-hook` (Python, stdin JSON)

- Wired into `~/.claude/settings.json` as an extra async hook on
  `PreToolUse`, `Stop`, `UserPromptSubmit`, next to the existing
  `claude-voice` hooks (which stay untouched).
- Appends one JSON line to `~/.local/state/claude-workshop/events.jsonl`:
  `{"t": <epoch>, "session": "<first 8 chars of session_id>", "event": "tool|stop|prompt", "station": "<station>", "label": "<short label>"}`
- Privacy: label is only a basename or a short verb, max 40 chars. Never
  file contents, never prompt text, never full Bash commands. Paths under
  secret locations from contract 3.6 (`.ssh`, `.gnupg`, `.env`, `*.kdbx`,
  credentials) get the label `secret`.
- Must never fail Claude: any error exits 0 silently. File trimmed to the
  last 2000 lines when it passes 5000.

### Station mapping

| Tool / case | Station | Label |
|---|---|---|
| Bash running `mv`, `cp`, `mkdir`, `rename`, `rsync`, `ln` | cabinet | `mv → <dest basename>` |
| Write, Edit, NotebookEdit | workbench | file basename |
| Read, Grep, Glob | bookshelf | basename or `search` |
| WebFetch, WebSearch, browser tools | telescope | domain or `web` |
| Agent / Task | helper | `helper` (spawns a second worker briefly) |
| Any other Bash | terminal | first word of command |
| Anything else | desk | tool name |
| `Stop` | rest | `done` |
| `UserPromptSubmit` | door | `new task` |

### 2. `workshop-server` (Python stdlib, 127.0.0.1:4186)

- `GET /` serves the page; `GET /theme` returns colors from
  `~/.local/state/omarchy/current/theme/colors.toml` (named keys, fallback
  palette if missing); `GET /events` is Server-Sent Events: tails
  events.jsonl and pushes new lines, plus today's counts on connect.
- Binds localhost only. Started by the launcher, exits when the window closes.

### 3. Page (`index.html` + `scene.js`, canvas)

- Portrait room drawn in code (no image assets), integer-scaled pixels,
  sized for 1080x1920.
- Stations around the room: filing cabinet, workbench, bookshelf, terminal,
  telescope/window, desk, a chair to rest in, the door.
- One worker per active session (different hat color). On each event the
  worker walks to the station and plays its animation: box flies between
  drawers, hammer + sparks, magnifier sweep, screen flicker, looking
  through the telescope. Events queue so fast bursts still all play
  (sped up when the queue is long).
- `rest`: worker sits, idle animations (stretch, sip mug). Workers with no
  events for 10 min walk out the door.
- Sign above the worker shows the label. Chalkboard shows today's counts
  per station. Re-fetches `/theme` every 30 s so theme changes apply.
- If SSE drops it reconnects; the scene keeps idling meanwhile.

### 4. `claude-workshop` launcher (bash, `~/.local/bin`)

- Starts the server if not running, then opens
  `chromium --app=http://127.0.0.1:4186` on workspace 8 via
  `hyprctl dispatch exec "[workspace 8 silent] ..."` (no Hyprland config
  edit). `claude-workshop stop` stops the server by PID.

## Files

- Project: `~/Projects/claude-workshop/` (git repo): `hook.py`,
  `server.py`, `web/index.html`, `web/scene.js`, `bin/claude-workshop`,
  `tests/`.
- Installed: symlinks in `~/.local/bin/` for `claude-workshop` and
  `workshop-hook`. Settings change: backup `settings.json` first
  (contract 2.2), add the hook entries.

## Testing

- `hook.py`: unit tests feeding sample hook JSON → expected station/label,
  secret redaction, never raises on garbage input.
- `server.py`: test that a line appended to a temp events file arrives over
  `/events`; `/theme` parses a sample colors.toml.
- Scene: render offscreen with headless chromium screenshot (never a
  desktop screenshot), with a scripted event sequence, and check each
  station animation shows.
- End to end: real hook in settings, run a few tool calls, confirm lines in
  events.jsonl.

## Out of scope (YAGNI)

Sound, history replay, stats pages, autostart at login, editing the scene
from the UI.

## Undo

Remove the hook entries from `settings.json` (or restore the backup),
remove the two symlinks, `mv` the project to `~/Archive/<date>/`.
