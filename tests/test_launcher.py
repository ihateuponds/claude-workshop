import http.server
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
from pathlib import Path

LAUNCHER = Path(__file__).resolve().parent.parent / "bin" / "claude-workshop"
DISPATCH = ('hl.dsp.exec_cmd("chromium --app=http://127.0.0.1:PORT '
            '--class=claude-workshop --user-data-dir=\'STATE/chromium\' --no-first-run", { workspace = "8 silent" })')


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _Ok(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *a):
        pass


class LauncherTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.state = root / "state"
        self.port = free_port()
        self.calls = root / "hypr.log"
        self.clients = root / "clients.json"
        fake = root / "fakebin"
        fake.mkdir()
        (fake / "hyprctl").write_text(
            '#!/usr/bin/env bash\n'
            'if [ "$1" = clients ]; then cat "$FAKE_CLIENTS" 2>/dev/null || echo "[]"; exit 0; fi\n'
            'printf "%s\\n" "$*" >> "$FAKE_CALLS"\n')
        (fake / "chromium").write_text('#!/usr/bin/env bash\necho "$@" >> "$FAKE_CALLS"\n')
        for f in fake.iterdir():
            f.chmod(0o755)
        self.env = dict(os.environ,
                        PATH=f"{fake}:{os.environ['PATH']}",
                        WORKSHOP_STATE=str(self.state),
                        WORKSHOP_PORT=str(self.port),
                        WORKSHOP_EVENTS=str(root / "events.jsonl"),
                        FAKE_CALLS=str(self.calls),
                        FAKE_CLIENTS=str(self.clients))
        self.addCleanup(self.run_launcher, "stop")

    def run_launcher(self, *args):
        return subprocess.run([str(LAUNCHER), *args], env=self.env,
                              capture_output=True, text=True, timeout=20)

    def pid(self):
        return int((self.state / "server.pid").read_text())

    def dispatches(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def alive(self, pid):
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False

    def test_start(self):
        r = self.run_launcher()
        self.assertEqual(r.returncode, 0, r.stderr)
        pid = self.pid()
        self.assertTrue(self.alive(pid))
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/theme", timeout=2) as resp:
            self.assertEqual(resp.status, 200)
        self.assertEqual(self.dispatches(),
                         ["dispatch " + DISPATCH.replace("PORT", str(self.port)).replace("STATE", str(self.state))])

    def test_second_start_reuses(self):
        self.run_launcher()
        pid = self.pid()
        r = self.run_launcher("start")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.pid(), pid)
        self.assertTrue(self.alive(pid))

    def test_existing_window_not_reopened(self):
        self.clients.write_text(json.dumps([{"class": "claude-workshop"}]))
        r = self.run_launcher()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("already open", r.stdout)
        self.assertEqual(self.dispatches(), [])

    def test_existing_app_window_found_by_title(self):
        # On Wayland chromium ignores --class for --app windows (seen live 2026-11-04).
        self.clients.write_text(json.dumps(
            [{"class": "chrome-127.0.0.1__-Default", "title": "Claude Workshop"}]))
        r = self.run_launcher()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("already open", r.stdout)
        self.assertEqual(self.dispatches(), [])

    def test_unmanaged_server_not_spawned(self):
        self.state.mkdir(parents=True)
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", self.port), _Ok)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        r = self.run_launcher()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("already running (unmanaged)", r.stdout)
        self.assertFalse((self.state / "server.pid").exists())
        self.assertEqual(len(self.dispatches()), 1)

    def test_stop(self):
        self.run_launcher()
        pid = self.pid()
        r = self.run_launcher("stop")
        self.assertEqual(r.returncode, 0, r.stderr)
        for _ in range(30):
            if not self.alive(pid):
                break
            time.sleep(0.1)
        self.assertFalse(self.alive(pid))
        self.assertFalse((self.state / "server.pid").exists())

    def test_stop_ignores_unrelated_pid(self):
        sleeper = subprocess.Popen(["sleep", "30"])
        self.addCleanup(lambda: (sleeper.kill(), sleeper.wait()))
        self.state.mkdir(parents=True)
        (self.state / "server.pid").write_text(str(sleeper.pid))
        self.run_launcher("stop")
        time.sleep(0.2)
        self.assertIsNone(sleeper.poll())
        self.assertFalse((self.state / "server.pid").exists())

    def test_status(self):
        self.assertIn("stopped", self.run_launcher("status").stdout)
        self.run_launcher()
        out = self.run_launcher("status").stdout
        self.assertIn("running", out)
        self.assertIn(str(self.pid()), out)
        self.assertIn(f"http://127.0.0.1:{self.port}", out)

    def test_unknown_arg(self):
        r = self.run_launcher("bogus")
        self.assertEqual(r.returncode, 2)
        self.assertIn("Usage", r.stderr)


if __name__ == "__main__":
    unittest.main()
