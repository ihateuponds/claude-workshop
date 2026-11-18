# Claude Workshop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pixel-art workshop window on the Sceptre where a worker acts out Claude's tool calls live.

**Architecture:** A Claude Code hook appends one JSON line per event to an events file. A stdlib Python server tails it and pushes lines over SSE to a canvas page. A bash launcher starts the server and opens the page as a chromium app window on workspace 8.

**Tech Stack:** Python 3.14 stdlib (`unittest`, `http.server`, `tomllib`), vanilla JS canvas, bash, chromium, hyprctl.

**Spec:** `docs/superpowers/specs/2026-11-04-claude-workshop-design.md`

## Global Constraints

- No installed dependencies: Python stdlib only, no npm.
- Server binds `127.0.0.1:4186` only.
- Events file: `~/.local/state/claude-workshop/events.jsonl`, overridable by env `WORKSHOP_EVENTS` (tests MUST set it, never touch the real file).
- Labels: basename or short verb, max 40 chars; never file contents, prompt text or full Bash commands.
- Secret paths (`.ssh`, `.gnupg`, `.env`, `*.kdbx`, `credentials`, `01-SECRETS`, `github-recovery-codes`) → label `secret`.
- Hook never fails Claude: any exception → exit 0, no output.
- Trim events file to last 2000 lines once it passes 5000.
- Theme: `~/.local/state/omarchy/current/theme/colors.toml`, named keys (`background`, `foreground`, `accent`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`…), fallback palette if missing.
- Window opens only when Ponds runs `claude-workshop`. Never screenshot the desktop; verify the scene with headless chromium only.
- Back up `~/.claude/settings.json` to `settings.json.bak.<timestamp>` before editing. Existing `claude-voice` hooks stay unchanged.

## Review Focus

1. Empty, non-JSON, or field-missing stdin to the hook → exit 0, nothing written (Task 1 test `test_garbage_input`).
2. Two hooks firing at once → whole lines, never interleaved (single `os.write` on an `O_APPEND` fd, `flock` around trim) (Task 1 test `test_concurrent_appends`).
3. Events file missing when the server starts (first run) → `/events` stays open and delivers the first line once it appears (Task 2 test `test_events_file_created_later`).
4. colors.toml missing or malformed → `/theme` returns the fallback palette, status 200 (Task 2 test `test_theme_fallback`).
5. A burst of 50 events → every one plays, queue speeds animations up, nothing dropped (Task 3 demo check `burst`).

---

### Task 1: Hook (`hook.py`)

**Files:**
- Create: `hook.py`, `tests/test_hook.py`

**Interfaces:**
- Produces: `classify(payload: dict) -> dict | None` returning `{"event": "tool"|"stop"|"prompt", "station": str, "label": str}`; `events_path() -> Path`; `append_event(path: Path, record: dict) -> None`; `main() -> int`. Record written: `{"t": float, "session": str(8), "event", "station", "label"}`.
- Stations (exact strings): `cabinet, workbench, bookshelf, telescope, helper, terminal, desk, rest, door`.

- [ ] **Step 1: Write failing tests** in `tests/test_hook.py` (unittest, `WORKSHOP_EVENTS` set to a temp file in `setUp`):
  - `test_write_edit` → `{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/home/user/x/notes.md"}}` gives `("tool","workbench","notes.md")`.
  - `test_read_grep_glob` → Read `a/b.py` → bookshelf `b.py`; Grep → bookshelf `search`; Glob → bookshelf `search`.
  - `test_bash_move` → Bash `mv ~/Downloads/a.zip ~/Archive/` → cabinet `mv → Archive`; `cp`, `mkdir`, `rsync`, `ln`, `rename` also cabinet.
  - `test_bash_other` → `git status` → terminal `git`; `sudo pacman -Syu` → terminal `sudo`.
  - `test_web` → WebFetch `https://wiki.archlinux.org/x` → telescope `wiki.archlinux.org`; WebSearch → telescope `web`; tool name starting `mcp__claude-in-chrome` → telescope `web`.
  - `test_agent` → Agent and Task → helper `helper`.
  - `test_other_tool` → `TodoWrite` → desk `TodoWrite`.
  - `test_stop_and_prompt` → Stop → `("stop","rest","done")`; UserPromptSubmit with `prompt:"secret plans"` → `("prompt","door","new task")` and `"secret plans"` not in the record.
  - `test_secret_redaction` → Read `~/.ssh/id_ed25519`, Edit `proj/.env`, `mv a.txt ~/.gnupg/` → label `secret`.
  - `test_label_length` → 80-char basename → label length ≤ 40.
  - `test_garbage_input` → `main()` with stdin `""`, `"not json"`, `"{}"` returns 0 and file has no lines.
  - `test_append_and_trim` → 5001 appends → file has 2000 lines, last one is the newest.
  - `test_concurrent_appends` → 8 `multiprocessing` workers × 200 appends → 1600 lines, each parses as JSON.
- [ ] **Step 2: Run** `python -m unittest tests.test_hook -v` → FAIL (no module `hook`).
- [ ] **Step 3: Implement `hook.py`.** Parse Bash with `shlex.split` (fallback `str.split` on error); skip leading `sudo`/env assignments only for move detection; dest = last non-flag arg. `main()` wraps everything in `try/except BaseException: return 0`. Append via `os.open(O_APPEND|O_CREAT|O_WRONLY)` + one `os.write`; trim under `fcntl.flock` when size check finds > 5000 lines (check line count only every ~100 writes, e.g. when `os.path.getsize` crosses a threshold, to stay cheap).
- [ ] **Step 4: Run** tests → all PASS.
- [ ] **Step 5: Commit** `feat: add workshop hook`.

### Task 2: Server (`server.py`)

**Files:**
- Create: `server.py`, `tests/test_server.py`

**Interfaces:**
- Consumes: events file format from Task 1; `hook.events_path()`.
- Produces: `read_theme(path: Path) -> dict` with keys `background, foreground, accent, palette` (`palette`: list of 6 hex strings from red, green, yellow, blue, magenta, cyan); `today_counts(path: Path) -> dict[str,int]` (station → count for events with `t` on today's local date); `make_server(port: int, events: Path, web_dir: Path, idle_exit: float) -> ThreadingHTTPServer`; `python server.py [--port 4186]`.
- HTTP: `GET /` and `/scene.js` from `web/`; `GET /theme` JSON; `GET /events` SSE: first message `event: counts` with `today_counts`, then `data: <line>` for each new line appended after connect, `: ping` every 15 s.
- Idle exit: when no SSE client has been connected for `idle_exit` seconds (default 60) after the first client disconnects, server shuts down.

- [ ] **Step 1: Write failing tests** (`make_server` on port 0 in a thread, temp events file):
  - `test_index_served` → `/` 200, contains `<canvas`.
  - `test_theme_reads_named_keys` → sample colors.toml with `background="#111111"`, `accent="#ff0000"` etc. → JSON matches, palette length 6.
  - `test_theme_fallback` → missing file and file `"not = [toml"` → 200, non-empty fallback.
  - `test_events_stream_new_line` → connect, append a record, receive it within 2 s; old lines from before connect are not resent.
  - `test_events_file_created_later` → file absent at connect, created + line appended → received.
  - `test_counts_today_only` → lines from yesterday and today → counts only today's.
  - `test_idle_exit` → `idle_exit=0.5`, connect then disconnect → `serve_forever` returns within 3 s.
- [ ] **Step 2: Run** `python -m unittest tests.test_server -v` → FAIL.
- [ ] **Step 3: Implement `server.py`.** Tail by polling file offset every 0.25 s per client; on truncation (size < offset, i.e. a trim happened) set offset to the new end of file, since the trimmed file holds only old lines. Theme path from env `WORKSHOP_THEME` else the Omarchy path.
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Commit** `feat: add workshop server`.

### Task 3: Scene (`web/index.html`, `web/scene.js`)

**Files:**
- Create: `web/index.html`, `web/scene.js`, `tests/render_scene.sh`

**Interfaces:**
- Consumes: `/theme`, `/events` (Task 2).
- Produces: `window.workshop.push(event)` (same record shape as Task 1); `?demo=<name>` plays a scripted sequence (`all` = one of each station, `burst` = 50 mixed events, `two` = two sessions) without a server; `?static=1` skips fetches (uses fallback theme) so it renders from `file://`.

- [ ] **Step 1: Build the room.** Logical canvas 180×320 pixels, integer-scaled to fill 1080×1920 with `image-rendering: pixelated`. Drawn in code from theme colors: floor, wall, door (bottom), filing cabinet, workbench, bookshelf, terminal, window+telescope, desk, chair, chalkboard (per-station counts), sign above worker.
- [ ] **Step 2: Workers.** One per `session`, hat color from `palette[i % 6]`. Event queue per worker: walk to station (simple path along floor), play the station animation ~1.2 s (cabinet: box arcs between drawers; workbench: hammer + sparks; bookshelf: magnifier sweep; terminal: screen flicker; telescope: look up; helper: a small second worker appears and leaves; desk: write; rest: sit in chair, idle stretch / sip loop; door: walks in from door). Queue length > 5 → durations scaled by `5/len`. No events for 10 min → walk out the door and remove.
- [ ] **Step 3: Connect live.** `EventSource('/events')`, `counts` message seeds the chalkboard, auto-reconnect; re-fetch `/theme` every 30 s.
- [ ] **Step 4: Write `tests/render_scene.sh`.** For each demo in `all burst two`: `chromium --headless=new --disable-gpu --window-size=1080,1920 --virtual-time-budget=<ms> --screenshot=<scratch>/scene-<demo>.png "file://$PWD/web/index.html?static=1&demo=<demo>&at=<ms>"`, where `at` freezes the demo clock at a given moment so stills land mid-animation. Check `--headless=new` and `--virtual-time-budget` exist in `chromium --help` first.
- [ ] **Step 5: Verify by looking.** Run the script, open each PNG with the Read tool: room is visible and fills the frame, worker is at the expected station, sign shows label, chalkboard counts, two hats in `two`, `burst` ends with all 50 counted. Fix and repeat until it looks right. Also check the browser console has no errors (`--enable-logging=stderr --v=0`, grep `Uncaught`).
- [ ] **Step 6: Commit** `feat: add pixel workshop scene`.

### Task 4: Launcher, install, end to end

**Files:**
- Create: `bin/claude-workshop`, `README.md` (short: what, run, undo)
- Modify: `~/.claude/settings.json` (after backup)
- Create symlinks: `~/.local/bin/claude-workshop` → `bin/claude-workshop`, `~/.local/bin/workshop-hook` → `hook.py` (executable, `#!/usr/bin/env python3`)

**Interfaces:**
- Consumes: `server.py` CLI (Task 2), `hook.py main()` (Task 1).
- Produces: `claude-workshop` (start + open window), `claude-workshop stop`, `claude-workshop status`. PID file `~/.local/state/claude-workshop/server.pid`.

- [ ] **Step 1: Write the launcher.** Start: if PID file's process is alive and `curl -s 127.0.0.1:4186/theme` succeeds, skip; else `setsid -f python3 server.py` with stdout/stderr to `~/.local/state/claude-workshop/server.log`, write PID, wait up to 3 s for the port. Then `hyprctl dispatch exec "[workspace 8 silent] chromium --app=http://127.0.0.1:4186 --class=claude-workshop"`. Stop: kill by PID from the file only (contract 3.5). `bash -n` it. Confirm the `hyprctl dispatch exec "[rules] cmd"` form works with the installed Hyprland (Lua config) using `hyprctl --help` / omarchy skill before relying on it.
- [ ] **Step 2: Install hook.** Back up settings.json, print path. Add `{"type":"command","command":"\"$HOME/.local/bin/workshop-hook\"","timeout":5,"async":true}` to the existing `PreToolUse`, `Stop` and `UserPromptSubmit` hook lists. Validate with `python -m json.tool`.
- [ ] **Step 3: End to end without a window.** Run `claude-workshop` server part only (`server.py` directly), `curl -N 127.0.0.1:4186/events` in background, make a few tool calls (Read, Edit, Bash mv in scratch), confirm lines in events.jsonl and on the curl stream. Labels contain no contents or full commands.
- [ ] **Step 4: Ask Ponds** before opening the window (contract 3.9), then run `claude-workshop`; Ponds confirms it lands on the Sceptre and the worker moves.
- [ ] **Step 5: Commit** `feat: add launcher and install` (repo files only). Add memory note `claude-workshop.md` + MEMORY.md line, and a row in `Machine/10-System/Log/System-Log.md` (settings.json hook, symlinks, undo).
