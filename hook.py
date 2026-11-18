#!/usr/bin/env python3
"""Claude Workshop hook: turn Claude Code hook JSON (stdin) into one event line."""
import fcntl
import json
import os
import re
import shlex
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

MAX_LABEL = 40
TRIM_OVER = 5000
TRIM_KEEP = 2000
MIN_LINE_BYTES = 64  # shorter than any real record, so >5000 lines always passes the gate
CHECK_SIZE = TRIM_OVER * MIN_LINE_BYTES  # only lock and count lines above this size

MOVE_VERBS = {"mv", "cp", "mkdir", "rsync", "ln", "rename"}
SECRET_DIRS = {".ssh", ".gnupg", "01-SECRETS"}


def events_path() -> Path:
    env = os.environ.get("WORKSHOP_EVENTS")
    if env:
        return Path(env)
    return Path.home() / ".local/state/claude-workshop/events.jsonl"


def is_secret(value) -> bool:
    if not isinstance(value, str) or not value:
        return False
    parts = [p for p in re.split(r"[/\\]", value) if p]
    for p in parts:
        if p in SECRET_DIRS:
            return True
    for p in parts:
        low = p.lower()
        if low == ".env" or low.startswith(".env.") or low.endswith(".kdbx") \
                or "credentials" in low or "github-recovery-codes" in low:
            return True
    return False


def clip(s: str) -> str:
    return s[:MAX_LABEL]


def base(path) -> str:
    if not isinstance(path, str):
        return ""
    return os.path.basename(path.rstrip("/")) or path.strip("/")


ENV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
REDIR_RE = re.compile(r"^&?\d*[<>]")
BARE_REDIR_RE = re.compile(r"^&?\d*[<>]+$")


def tokenize(seg: str) -> list:
    try:
        return shlex.split(seg)
    except ValueError:
        return seg.split()


SETUP_CMDS = {"cd", "pushd", "popd", "set", "export", "true", ":"}
REAL_MOVES = MOVE_VERBS - {"mkdir"}


def segments(cmd: str) -> list:
    """Word lists of each command in a chain (&&, ||, ;, |, newline), empties dropped."""
    return [w for w in (tokenize(seg) for seg in re.split(r"&&|\|\||;|\||\n", cmd)) if w]


def core(words: list) -> list:
    """Words after leading env assignments and sudo; empty for a pure assignment."""
    rest = list(words)
    while rest and (rest[0] == "sudo" or ENV_RE.match(rest[0])):
        rest.pop(0)
    return rest


def drop_redirects(args: list) -> list:
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a == "&":
            continue
        if BARE_REDIR_RE.match(a):
            skip = True
            continue
        if REDIR_RE.match(a):
            continue
        out.append(a)
    return out


def classify_bash(cmd) -> tuple:
    segs = segments(cmd) if isinstance(cmd, str) else []
    if not segs:
        return "terminal", "bash"
    real = [w for w in segs if core(w) and os.path.basename(core(w)[0]) not in SETUP_CMDS]
    moves = [w for w in real if os.path.basename(core(w)[0]) in MOVE_VERBS]
    move = next((w for w in moves if os.path.basename(core(w)[0]) in REAL_MOVES),
                moves[0] if moves else None)
    if any(is_secret(x) for w in segs for x in w):
        return ("cabinet" if move else "terminal"), "secret"
    if move:
        rest = core(move)
        verb = os.path.basename(rest[0])
        args = [a for a in drop_redirects(rest[1:]) if not a.startswith("-")]
        return "cabinet", clip(f"{verb} → {base(args[-1])}" if args else verb)
    if real:
        label_words = [x for x in real[0] if not ENV_RE.match(x)] or ["bash"]
        return "terminal", clip(os.path.basename(label_words[0]) or "bash")
    first = next((core(w) for w in segs if core(w)), None)
    return "terminal", clip(os.path.basename(first[0]) if first else "bash")


MAX_DOING = 60
PRIVATE = "Working with a private file"
TOOL_PHRASES = {"TodoWrite": "Updating the to-do list", "Skill": "Loading a skill",
                "AskUserQuestion": "Asking you a question", "ToolSearch": "Looking up a tool",
                "SendMessage": "Messaging a helper", "SubagentHandback": "Getting a helper's report",
                "ScheduleWakeup": "Setting a reminder"}


def sentence(text) -> str:
    """One tidy line, at most MAX_DOING chars, first letter capitalised."""
    s = " ".join(str(text).split())
    if len(s) > MAX_DOING:
        s = s[:MAX_DOING - 2].rstrip() + ".."
    return s[:1].upper() + s[1:]


def private(text) -> bool:
    return isinstance(text, str) and any(is_secret(w.strip("'\",:;()")) for w in text.split())


def classify(payload: dict):
    if not isinstance(payload, dict):
        return None
    ev = payload.get("hook_event_name")
    if ev == "Stop":
        return {"event": "stop", "station": "rest", "label": "done", "doing": "Done, resting"}
    if ev == "UserPromptSubmit":
        return {"event": "prompt", "station": "door", "label": "new task", "doing": "Got a new task"}
    if ev != "PreToolUse":
        return None
    tool = payload.get("tool_name")
    if not isinstance(tool, str) or not tool:
        return None
    inp = payload.get("tool_input")
    if not isinstance(inp, dict):
        inp = {}

    def rec(station, label, doing):
        if label == "secret" or private(doing):
            doing = PRIVATE
        return {"event": "tool", "station": station, "label": clip(label), "doing": sentence(doing)}

    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        p = inp.get("file_path") or inp.get("notebook_path") or ""
        name = "secret" if is_secret(p) else (base(p) or tool)
        verb = "Writing" if tool == "Write" else "Editing"
        return rec("workbench", name, f"{verb} {name}")
    if tool == "Read":
        p = inp.get("file_path") or ""
        name = "secret" if is_secret(p) else (base(p) or tool)
        return rec("bookshelf", name, f"Reading {name}")
    if tool in ("Grep", "Glob"):
        return rec("bookshelf", "search", "Searching files" if tool == "Grep" else "Finding files")
    if tool == "Bash":
        station, label = classify_bash(inp.get("command"))
        desc = inp.get("description")
        if isinstance(desc, str) and desc.strip():
            doing = desc
        elif station == "cabinet" and "→" in label:
            doing = f"Moving files to {label.split('→', 1)[1].strip()}"
        else:
            doing = f"Running {label}"
        return rec(station, label, doing)
    if tool == "WebFetch":
        host = ""
        try:
            host = urlparse(inp.get("url") or "").hostname or ""
        except ValueError:
            pass
        return rec("telescope", host or "web", f"Reading {host}" if host else "Reading a web page")
    if tool == "WebSearch":
        q = inp.get("query")
        return rec("telescope", "web", f"Searching the web: {q}" if isinstance(q, str) and q.strip()
                   else "Searching the web")
    if tool.startswith("mcp__claude-in-chrome"):
        return rec("telescope", "web", "Using the browser")
    if tool in ("Agent", "Task"):
        d = inp.get("description")
        return rec("helper", "helper", f"Helper: {d}" if isinstance(d, str) and d.strip() else "Sending a helper")
    if tool.startswith("mcp__") and tool.count("__") >= 2:
        name = tool.rsplit("__", 1)[1] or tool
        return rec("desk", name, f"Using {name.replace('_', ' ')}")
    return rec("desk", tool, TOOL_PHRASES.get(tool, f"Using {tool}"))


def _trim(fd: int) -> None:
    """Called holding LOCK_EX. Keep the last TRIM_KEEP lines if over TRIM_OVER."""
    size = os.fstat(fd).st_size
    if size < CHECK_SIZE:
        return
    with open(fd, "r+b", closefd=False) as f:
        f.seek(0)
        lines = f.read().splitlines(keepends=True)
        if len(lines) <= TRIM_OVER:
            return
        keep = b"".join(lines[-TRIM_KEEP:])
        f.seek(0)
        f.write(keep)
        f.truncate()
        f.flush()


def append_event(path: Path, record: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_SH)
        os.write(fd, data)
        fcntl.flock(fd, fcntl.LOCK_UN)
        if os.fstat(fd).st_size >= CHECK_SIZE:
            rfd = os.open(path, os.O_RDWR)
            try:
                fcntl.flock(rfd, fcntl.LOCK_EX)
                _trim(rfd)
            finally:
                os.close(rfd)
    finally:
        os.close(fd)


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
        result = classify(payload)
        if result is None:
            return 0
        sid = payload.get("session_id")
        record = {"t": time.time(), "session": str(sid or "")[:8], **result}
        append_event(events_path(), record)
    except BaseException:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
