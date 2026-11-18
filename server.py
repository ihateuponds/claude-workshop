#!/usr/bin/env python3
"""Claude Workshop server: serves the canvas page, Omarchy theme, and an SSE event stream."""
import argparse
import fcntl
import json
import re
import os
import select
import sys
import threading
import time
import tomllib
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from hook import events_path

POLL = 0.25
JS_RE = re.compile(r"^/js/([a-z][a-z0-9-]*)\.js$")
PING = 15.0
STATIC = {"/": ("index.html", "text/html; charset=utf-8")}
FALLBACK = {"background": "#1a1b26", "foreground": "#c0caf5", "accent": "#7aa2f7",
            "palette": ["#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff"]}
PALETTE_KEYS = ["red", "green", "yellow", "blue", "magenta", "cyan"]


def theme_path() -> Path:
    env = os.environ.get("WORKSHOP_THEME")
    if env:
        return Path(env)
    return Path.home() / ".local/state/omarchy/current/theme/colors.toml"


def read_theme(path: Path) -> dict:
    out = {**FALLBACK, "palette": list(FALLBACK["palette"])}
    try:
        data = tomllib.loads(Path(path).read_text())
    except (OSError, ValueError):
        return out
    for key in ("background", "foreground", "accent"):
        if isinstance(data.get(key), str) and data[key]:
            out[key] = data[key]
    for i, key in enumerate(PALETTE_KEYS):
        if isinstance(data.get(key), str) and data[key]:
            out["palette"][i] = data[key]
    return out


def today_counts(path: Path) -> dict:
    counts: dict = {}
    today = datetime.now().date()
    try:
        with open(path, "rb") as f:
            for raw in f:
                try:
                    rec = json.loads(raw)
                    if datetime.fromtimestamp(rec["t"]).date() != today:
                        continue
                    st = rec["station"]
                except (ValueError, KeyError, TypeError, OSError, OverflowError):
                    continue
                if isinstance(st, str):
                    counts[st] = counts.get(st, 0) + 1
    except OSError:
        pass
    return counts


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, status, ctype, body: bytes):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            path = self.path.split("?", 1)[0]
            if path in STATIC:
                name, ctype = STATIC[path]
                try:
                    body = (self.server.web_dir / name).read_bytes()
                except OSError:
                    return self._send(404, "text/plain", b"not found")
                self._send(200, ctype, body)
            elif JS_RE.match(path):
                f = self.server.web_dir / "js" / (JS_RE.match(path)[1] + ".js")
                try:
                    body = f.read_bytes()
                except OSError:
                    return self._send(404, "text/plain", b"not found")
                self._send(200, "text/javascript; charset=utf-8", body)
            elif path == "/theme":
                body = json.dumps(read_theme(theme_path())).encode()
                self._send(200, "application/json", body)
            elif path == "/events":
                self._events()
            else:
                self._send(404, "text/plain", b"not found")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def _events(self):
        srv = self.server
        srv.client_connected()
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            path = srv.events
            counts = today_counts(path)
            try:
                offset = path.stat().st_size
            except OSError:
                offset = 0
            self.wfile.write(b"event: counts\ndata: " + json.dumps(counts).encode() + b"\n\n")
            self.wfile.flush()
            buf = b""
            last = time.monotonic()
            while not srv.stopping.is_set():
                try:
                    size = path.stat().st_size
                except OSError:
                    size = 0
                    offset = 0
                    buf = b""
                if size < offset:  # trimmed in place: remaining lines are all old
                    size = self._settled_size(path)
                    offset, buf = size, b""
                if size > offset:
                    with open(path, "rb") as f:
                        f.seek(offset)
                        chunk = f.read(size - offset)
                    offset += len(chunk)
                    buf += chunk
                    *lines, buf = buf.split(b"\n")
                    out = b""
                    for ln in lines:
                        try:
                            json.loads(ln)
                        except ValueError:
                            continue
                        out += b"data: " + ln + b"\n\n"
                    if out:
                        self.wfile.write(out)
                        self.wfile.flush()
                        last = time.monotonic()
                if time.monotonic() - last >= srv.ping:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last = time.monotonic()
                if self._peer_closed():
                    break
                srv.stopping.wait(srv.poll)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError):
            pass
        finally:
            srv.client_gone()

    @staticmethod
    def _settled_size(path) -> int:
        # hook's trim holds LOCK_EX until done; LOCK_SH waits for it to finish
        try:
            with open(path, "rb") as f:
                fcntl.flock(f, fcntl.LOCK_SH)
                return os.fstat(f.fileno()).st_size
        except OSError:
            return 0

    def _peer_closed(self) -> bool:
        r, _, _ = select.select([self.connection], [], [], 0)
        if not r:
            return False
        try:
            return self.connection.recv(1, 2) == b""  # MSG_PEEK
        except BlockingIOError:
            return False
        except OSError:
            return True

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True


class WorkshopServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, events, web_dir, idle_exit, poll=POLL, ping=PING):
        super().__init__(addr, Handler)
        self.events = Path(events)
        self.web_dir = Path(web_dir)
        self.idle_exit = idle_exit
        self.poll = poll
        self.ping = ping
        self.stopping = threading.Event()
        self._lock = threading.Lock()
        self._clients = 0
        self._idle_gen = 0

    def serve_forever(self, poll_interval=0.05):
        self._arm_idle()
        super().serve_forever(poll_interval)

    def _arm_idle(self):
        with self._lock:
            self._idle_gen += 1
            gen = self._idle_gen
        t = threading.Timer(self.idle_exit, self._idle_check, args=(gen,))
        t.daemon = True
        t.start()

    def client_connected(self):
        with self._lock:
            self._clients += 1
            self._idle_gen += 1

    def client_gone(self):
        with self._lock:
            self._clients -= 1
            if self._clients > 0:
                return
        self._arm_idle()

    def _idle_check(self, gen):
        with self._lock:
            if gen != self._idle_gen or self._clients > 0:
                return
        self.shutdown()

    def shutdown(self):
        self.stopping.set()
        super().shutdown()

    def handle_error(self, request, client_address):
        if isinstance(sys.exception(), (BrokenPipeError, ConnectionResetError,
                                        ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def make_server(port: int, events: Path, web_dir: Path, idle_exit: float) -> ThreadingHTTPServer:
    return WorkshopServer(("127.0.0.1", port), events, web_dir, idle_exit)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=4186)
    ap.add_argument("--idle-exit", type=float, default=60)
    args = ap.parse_args()
    srv = make_server(args.port, events_path(), Path(__file__).resolve().parent / "web",
                      args.idle_exit)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
