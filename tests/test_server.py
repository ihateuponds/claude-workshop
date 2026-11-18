import contextlib
import fcntl
import http.client
import io
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path

import server

WEB = Path(__file__).resolve().parent.parent / "web"


def rec(station="desk", t=None):
    return json.dumps({"t": time.time() if t is None else t, "session": "s",
                       "event": "tool", "station": station, "label": "x"})


class Base(unittest.TestCase):
    idle = 60

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.events = Path(self.tmp.name) / "events.jsonl"
        self.theme = Path(self.tmp.name) / "colors.toml"
        os.environ["WORKSHOP_EVENTS"] = str(self.events)
        os.environ["WORKSHOP_THEME"] = str(self.theme)
        self.addCleanup(os.environ.pop, "WORKSHOP_EVENTS", None)
        self.addCleanup(os.environ.pop, "WORKSHOP_THEME", None)
        self.srv = server.make_server(0, self.events, WEB, self.idle)
        self.port = self.srv.server_address[1]
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()

    def get(self, path):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", path)
        r = c.getresponse()
        body = r.read()
        c.close()
        return r.status, body

    def sse(self):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", "/events")
        return c, c.getresponse()

    def read_msg(self, resp):
        lines = []
        while True:
            line = resp.fp.readline().decode()
            if line in ("\n", ""):
                if lines:
                    return "".join(lines)
                if line == "":
                    return None
                continue
            lines.append(line)


class TestStatic(Base):
    def test_index_served(self):
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"<canvas", body)
        self.assertEqual(self.get("/scene.js")[0], 404)  # the pixel scene is gone; scripts live in /js/

    def test_js_served(self):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", "/js/engine.js")
        r = c.getresponse(); r.read(); c.close()
        self.assertEqual(r.status, 200)
        self.assertTrue(r.getheader("Content-Type", "").startswith("text/javascript"))

    def test_js_rejects_bad_names(self):
        for bad in ("/js/../server.py", "/js/Bad.js", "/js/a.txt", "/js/", "/js/..%2Fserver.js", "/js/nope.js"):
            self.assertEqual(self.get(bad)[0], 404, bad)

    def test_other_paths_404(self):
        self.assertEqual(self.get("/../server.py")[0], 404)
        self.assertEqual(self.get("/nope")[0], 404)


class TestTheme(Base):
    def test_theme_reads_named_keys(self):
        self.theme.write_text('background = "#111111"\nforeground = "#222222"\n'
                              'accent = "#ff0000"\nred = "#1"\ngreen = "#2"\n'
                              'yellow = "#3"\nblue = "#4"\nmagenta = "#5"\ncyan = "#6"\n')
        status, body = self.get("/theme")
        d = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(d["background"], "#111111")
        self.assertEqual(d["accent"], "#ff0000")
        self.assertEqual(d["palette"], ["#1", "#2", "#3", "#4", "#5", "#6"])

    def test_theme_fallback(self):
        for text in (None, "not = [toml"):
            if text:
                self.theme.write_text(text)
            status, body = self.get("/theme")
            d = json.loads(body)
            self.assertEqual(status, 200)
            self.assertEqual(d["background"], "#1a1b26")
            self.assertEqual(len(d["palette"]), 6)

    def test_theme_partial_fills_missing(self):
        self.theme.write_text('accent = "#abcdef"\n')
        d = json.loads(self.get("/theme")[1])
        self.assertEqual(d["accent"], "#abcdef")
        self.assertEqual(d["foreground"], "#c0caf5")
        self.assertEqual(len(d["palette"]), 6)


class TestEvents(Base):
    def test_events_stream_new_line(self):
        self.events.write_text(rec("cabinet") + "\n")
        c, r = self.sse()
        self.assertEqual(r.getheader("Content-Type"), "text/event-stream")
        first = self.read_msg(r)
        self.assertTrue(first.startswith("event: counts"))
        line = rec("desk")
        with open(self.events, "a") as f:
            f.write("garbage not json\n" + line + "\n")
        msg = self.read_msg(r)
        self.assertEqual(msg.strip(), "data: " + line)
        c.close()

    def test_events_file_created_later(self):
        c, r = self.sse()
        self.assertEqual(json.loads(self.read_msg(r).split("data: ")[1]), {})
        line = rec("door")
        self.events.write_text(line + "\n")
        self.assertEqual(self.read_msg(r).strip(), "data: " + line)
        c.close()

    def test_counts_today_only(self):
        self.events.write_text("\n".join([
            rec("cabinet", time.time() - 2 * 86400), rec("cabinet"), rec("cabinet"),
            rec("desk"), "bad"]) + "\n")
        self.assertEqual(server.today_counts(self.events), {"cabinet": 2, "desk": 1})
        c, r = self.sse()
        msg = self.read_msg(r)
        self.assertTrue(msg.startswith("event: counts\ndata: "))
        self.assertEqual(json.loads(msg.split("data: ")[1]), {"cabinet": 2, "desk": 1})
        c.close()

    def test_truncation_skips_to_end(self):
        self.events.write_text("\n".join(rec() for _ in range(5)) + "\n")
        c, r = self.sse()
        self.read_msg(r)
        self.events.write_text(rec("rest") + "\n")  # trimmed: smaller than offset
        time.sleep(0.6)
        line = rec("telescope")
        with open(self.events, "a") as f:
            f.write(line + "\n")
        self.assertEqual(self.read_msg(r).strip(), "data: " + line)
        c.close()

    def test_trim_does_not_replay_old_lines(self):
        old = [rec("rest") for _ in range(5)]
        self.events.write_text("\n".join(old) + "\n")
        c, r = self.sse()
        self.read_msg(r)
        kept = ("\n".join(rec("bookshelf") for _ in range(2)) + "\n").encode()
        new = rec("telescope")

        def trim():
            fd = os.open(self.events, os.O_RDWR)
            fcntl.flock(fd, fcntl.LOCK_EX)
            os.ftruncate(fd, 0)
            time.sleep(0.6)
            os.pwrite(fd, kept, 0)
            time.sleep(0.3)
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
            with open(self.events, "a") as f:
                f.write(new + "\n")
        t = threading.Thread(target=trim)
        t.start()
        self.assertEqual(self.read_msg(r).strip(), "data: " + new)
        t.join()
        c.close()


class TestErrors(Base):
    def test_unexpected_error_reaches_stderr(self):
        orig = server.read_theme
        server.read_theme = lambda p: (_ for _ in ()).throw(RuntimeError("boom-xyz"))
        self.addCleanup(setattr, server, "read_theme", orig)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            try:
                self.get("/theme")
            except Exception:
                pass
            time.sleep(0.3)
        self.assertIn("boom-xyz", err.getvalue())


class TestIdle(unittest.TestCase):
    def test_idle_exit_without_any_client(self):
        with tempfile.TemporaryDirectory() as d:
            srv = server.make_server(0, Path(d) / "e.jsonl", WEB, 0.5)
            done = threading.Event()

            def run():
                srv.serve_forever()
                done.set()
            threading.Thread(target=run, daemon=True).start()
            self.assertTrue(done.wait(3))
            srv.server_close()

    def test_idle_exit(self):
        with tempfile.TemporaryDirectory() as d:
            events = Path(d) / "e.jsonl"
            srv = server.make_server(0, events, WEB, 0.5)
            done = threading.Event()

            def run():
                srv.serve_forever()
                done.set()
            threading.Thread(target=run, daemon=True).start()
            c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
            c.request("GET", "/events")
            r = c.getresponse()
            r.fp.readline()
            r.close()
            c.close()
            self.assertTrue(done.wait(3))
            srv.server_close()


if __name__ == "__main__":
    unittest.main()
