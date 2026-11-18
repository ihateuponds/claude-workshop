# Claude Workshop

A cutaway "mind mansion" that shows what Claude Code is doing. A hook writes one
line per event to a local file; a tiny local server streams those lines to a
window where little residents ride a glass elevator between rooms, one room per
kind of work: library (reading), workshop (editing), archive (moving files),
engine room (commands), observatory (web), drone pad (helpers) and the parlor
(new tasks, other tools, resting). The panel at the bottom says what is
happening now and sums up today.

## Run

    claude-workshop          # start the server if needed, open the window
    claude-workshop status   # running or stopped, PID, URL
    claude-workshop stop     # stop the server (by the PID in its pid file only)

The server listens on 127.0.0.1:4186 only and exits by itself after 60 seconds
with no window connected. Override with `WORKSHOP_PORT` and `WORKSHOP_STATE`.

## Where things live

- Events: `~/.local/state/claude-workshop/events.jsonl` (override with `WORKSHOP_EVENTS`)
- Server pid and log: `~/.local/state/claude-workshop/server.pid`, `server.log`
- Hook: `hook.py`, linked as `~/.local/bin/workshop-hook`

## Privacy

Events keep only file names and short labels, never file contents or full
commands. Anything that looks like a secret is written as `secret`. Nothing
leaves the machine.

## How this was made

I designed this and directed the build; the code was written by AI coding agents
(Claude Code and Gemini via Antigravity), with a second AI reviewing every risky
change before it landed. The design docs in `docs/` are the real specs and plans
the agents worked from.

## Undo

1. Remove the `workshop-hook` entries from the `hooks` lists in `~/.claude/settings.json`.
2. Remove the symlinks `~/.local/bin/claude-workshop` and `~/.local/bin/workshop-hook`.
3. Run `claude-workshop stop`, then move this folder and `~/.local/state/claude-workshop` to your archive.
