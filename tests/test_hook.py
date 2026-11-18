import io
import json
import multiprocessing
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import hook  # noqa: E402


def _worker(path, n):
    for i in range(n):
        hook.append_event(Path(path), {"t": 1.0, "session": "abcdefgh", "event": "tool",
                                       "station": "desk", "label": "x" * 20})


def pre(tool, **inp):
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": inp}


def bash(cmd):
    return pre("Bash", command=cmd)


class HookTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "sub" / "events.jsonl"
        patcher = mock.patch.dict(os.environ, {"WORKSHOP_EVENTS": str(self.path)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def c(self, payload):
        r = hook.classify(payload)
        return (r["event"], r["station"], r["label"]) if r else None

    def test_write_edit(self):
        self.assertEqual(self.c(pre("Edit", file_path="/home/user/x/notes.md")),
                         ("tool", "workbench", "notes.md"))
        self.assertEqual(self.c(pre("Write", file_path="/a/b.txt"))[1], "workbench")
        self.assertEqual(self.c(pre("NotebookEdit", notebook_path="/a/n.ipynb")),
                         ("tool", "workbench", "n.ipynb"))

    def test_read_grep_glob(self):
        self.assertEqual(self.c(pre("Read", file_path="a/b.py")), ("tool", "bookshelf", "b.py"))
        self.assertEqual(self.c(pre("Grep", pattern="foo")), ("tool", "bookshelf", "search"))
        self.assertEqual(self.c(pre("Glob", pattern="*.py")), ("tool", "bookshelf", "search"))

    def test_bash_move(self):
        self.assertEqual(self.c(bash("mv ~/Downloads/a.zip ~/Archive/")),
                         ("tool", "cabinet", "mv → Archive"))
        for cmd, label in [("cp a b/c.txt", "cp → c.txt"), ("mkdir -p x/newdir", "mkdir → newdir"),
                           ("rsync -av a/ b/", "rsync → b"), ("ln -s a link", "ln → link"),
                           ("rename x y z", "rename → z"), ("sudo mv a b", "mv → b"),
                           ("FOO=1 mv a b", "mv → b")]:
            self.assertEqual(self.c(bash(cmd)), ("tool", "cabinet", label), cmd)

    def test_bash_chain_move_anywhere_wins(self):
        self.assertEqual(self.c(bash("git status && mv a b"))[1:], ("cabinet", "mv → b"))
        self.assertEqual(self.c(bash("git status && ls"))[1:], ("terminal", "git"))
        self.assertEqual(self.c(bash("mv a b; ls"))[1:], ("cabinet", "mv → b"))
        self.assertEqual(self.c(bash("mv a b | cat"))[1:], ("cabinet", "mv → b"))

    def test_cd_prefix_skipped(self):
        self.assertEqual(self.c(bash("cd /x && mv a b"))[1:], ("cabinet", "mv → b"))
        self.assertEqual(self.c(bash("cd /x && git status"))[1:], ("terminal", "git"))
        self.assertEqual(self.c(bash("cd /x; pushd y && cp a b"))[1:], ("cabinet", "cp → b"))
        self.assertEqual(self.c(bash("cd /x"))[1:], ("terminal", "cd"))
        self.assertEqual(self.c(bash("cd ~/.ssh && ls"))[1:], ("terminal", "secret"))

    def test_redirections_ignored(self):
        self.assertEqual(self.c(bash("cp a b 2>&1"))[1:], ("cabinet", "cp → b"))
        self.assertEqual(self.c(bash("cp a b > log"))[1:], ("cabinet", "cp → b"))
        self.assertEqual(self.c(bash("cp a b >> log 2>/dev/null &"))[1:], ("cabinet", "cp → b"))

    def test_mcp_tool_label(self):
        self.assertEqual(
            self.c(pre("mcp__claude_ai_Era_Context__transactions__search_transactions")),
            ("tool", "desk", "search_transactions"))

    def test_real_organize_commands_go_to_cabinet(self):
        # Shapes seen live 2026-11-04 while organizing Downloads.
        cmd = ('cd ~/Downloads && A=~/Archive/2026-11-04/downloads-archives && '
               'mkdir -p Installers Games "$A" && set -e\n'
               'mv -nv eglantine-x.AppImage ~/Applications/\n'
               'mv -nv a.zip b.exe Installers/')
        self.assertEqual(self.c(bash(cmd))[1:], ("cabinet", "mv → Applications"))
        self.assertEqual(self.c(bash("cd ~/Pictures && set -e; mv -nv s.png Screenshots/"))[1:],
                         ("cabinet", "mv → Screenshots"))
        self.assertEqual(self.c(bash("mkdir -p d && mv -nv x d/"))[1:], ("cabinet", "mv → d"))
        self.assertEqual(self.c(bash("mkdir -p d && ls d"))[1:], ("cabinet", "mkdir → d"))
        self.assertEqual(self.c(bash("ls -A ~/Downloads; mv a b"))[1:], ("cabinet", "mv → b"))

    def test_assignment_value_never_a_label(self):
        r = hook.classify(bash("A=~/Archive/secret-plans && ls"))
        self.assertEqual(r["label"], "ls")
        r = hook.classify(bash("A=~/Archive/secret-plans"))
        self.assertNotIn("secret-plans", json.dumps(r))
        self.assertEqual(self.c(bash("set -e; git status"))[1:], ("terminal", "git"))
        self.assertEqual(self.c(bash("export X=1 && make"))[1:], ("terminal", "make"))

    def test_env_assignment_not_leaked(self):
        r = hook.classify(bash("TOKEN=abc123 curl x"))
        self.assertEqual(r["label"], "curl")
        self.assertNotIn("abc123", json.dumps(r))
        self.assertEqual(self.c(bash("FOO=1 git status")), ("tool", "terminal", "git"))
        self.assertEqual(self.c(bash("sudo pacman -Syu"))[2], "sudo")

    def test_no_trim_check_after_trim(self):
        self.path.parent.mkdir(parents=True)
        rec = {"t": 1.0, "session": "abcdefgh", "event": "tool", "station": "desk", "label": "y" * 40}
        line = json.dumps(rec, separators=(",", ":")) + "\n"
        self.path.write_text(line * 2000)
        with mock.patch.object(hook, "_trim") as trim, mock.patch("fcntl.flock") as flock:
            hook.append_event(self.path, rec)
        trim.assert_not_called()
        self.assertNotIn(hook.fcntl.LOCK_EX, [c.args[1] for c in flock.call_args_list])

    def test_bash_other(self):
        self.assertEqual(self.c(bash("git status")), ("tool", "terminal", "git"))
        self.assertEqual(self.c(bash("sudo pacman -Syu")), ("tool", "terminal", "sudo"))

    def test_web(self):
        self.assertEqual(self.c(pre("WebFetch", url="https://wiki.archlinux.org/x")),
                         ("tool", "telescope", "wiki.archlinux.org"))
        self.assertEqual(self.c(pre("WebSearch", query="q")), ("tool", "telescope", "web"))
        self.assertEqual(self.c(pre("mcp__claude-in-chrome__navigate")), ("tool", "telescope", "web"))

    def test_agent(self):
        self.assertEqual(self.c(pre("Agent")), ("tool", "helper", "helper"))
        self.assertEqual(self.c(pre("Task")), ("tool", "helper", "helper"))

    def test_other_tool(self):
        self.assertEqual(self.c(pre("TodoWrite")), ("tool", "desk", "TodoWrite"))

    def test_stop_and_prompt(self):
        self.assertEqual(self.c({"hook_event_name": "Stop"}), ("stop", "rest", "done"))
        p = {"hook_event_name": "UserPromptSubmit", "prompt": "secret plans", "session_id": "abcdefghij"}
        self.assertEqual(self.c(p), ("prompt", "door", "new task"))
        self.assertNotIn("secret plans", json.dumps(hook.classify(p)))
        with mock.patch("sys.stdin", io.StringIO(json.dumps(p))):
            self.assertEqual(hook.main(), 0)
        rec = json.loads(self.path.read_text())
        self.assertNotIn("secret plans", json.dumps(rec))
        self.assertEqual(rec["session"], "abcdefgh")
        self.assertEqual(set(rec), {"t", "session", "event", "station", "label", "doing"})

    def test_secret_redaction(self):
        for payload in [pre("Read", file_path=os.path.expanduser("~/.ssh/id_ed25519")),
                        pre("Edit", file_path="proj/.env"),
                        bash("mv a.txt ~/.gnupg/"),
                        pre("Read", file_path="/x/pw.kdbx"),
                        pre("Read", file_path="/x/credentials.json"),
                        pre("Read", file_path="/b/01-SECRETS/a.md"),
                        pre("Read", file_path="/b/github-recovery-codes.txt"),
                        bash("cat ~/.ssh/id_rsa")]:
            self.assertEqual(self.c(payload)[2], "secret", payload)

    def test_label_length(self):
        r = self.c(pre("Read", file_path="/a/" + "n" * 80))
        self.assertLessEqual(len(r[2]), 40)

    def test_garbage_input(self):
        for s in ["", "not json", "{}"]:
            with mock.patch("sys.stdin", io.StringIO(s)), mock.patch("sys.stdout", io.StringIO()) as out:
                self.assertEqual(hook.main(), 0)
                self.assertEqual(out.getvalue(), "")
        self.assertFalse(self.path.exists() and self.path.read_text())

    def test_append_and_trim(self):
        for i in range(5001):
            hook.append_event(self.path, {"t": float(i), "session": "abcdefgh", "event": "tool",
                                          "station": "desk", "label": "x"})
        lines = self.path.read_text().splitlines()
        self.assertEqual(len(lines), 2000)
        self.assertEqual(json.loads(lines[-1])["t"], 5000.0)

    def test_concurrent_appends(self):
        self.path.parent.mkdir(parents=True)
        ps = [multiprocessing.Process(target=_worker, args=(str(self.path), 200)) for _ in range(8)]
        [p.start() for p in ps]
        [p.join() for p in ps]
        lines = self.path.read_text().splitlines()
        self.assertEqual(len(lines), 1600)
        for ln in lines:
            json.loads(ln)

    def test_events_path_default(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("WORKSHOP_EVENTS")
            self.assertEqual(hook.events_path(),
                             Path.home() / ".local/state/claude-workshop/events.jsonl")


if __name__ == "__main__":
    unittest.main()


class DoingTest(unittest.TestCase):
    def d(self, payload):
        return hook.classify(payload)["doing"]

    def test_bash_uses_my_description(self):
        self.assertEqual(self.d(pre("Bash", command="mv a b", description="Move Downloads items into their new folders")),
                         "Move Downloads items into their new folders")

    def test_bash_without_description_falls_back(self):
        self.assertEqual(self.d(bash("mv -nv a.zip Installers/")), "Moving files to Installers")
        self.assertEqual(self.d(bash("git status")), "Running git")

    def test_tools_get_plain_phrases(self):
        self.assertEqual(self.d(pre("Read", file_path="/x/README.md")), "Reading README.md")
        self.assertEqual(self.d(pre("Edit", file_path="/x/hook.py")), "Editing hook.py")
        self.assertEqual(self.d(pre("Write", file_path="/x/notes.md")), "Writing notes.md")
        self.assertEqual(self.d(pre("Grep", pattern="TODO")), "Searching files")
        self.assertEqual(self.d(pre("Glob", pattern="*.py")), "Finding files")
        self.assertEqual(self.d(pre("WebFetch", url="https://wiki.archlinux.org/x")), "Reading wiki.archlinux.org")
        self.assertEqual(self.d(pre("WebSearch", query="hyprland window rules")),
                         "Searching the web: hyprland window rules")
        self.assertEqual(self.d(pre("Agent", description="Review Task 2")), "Helper: Review Task 2")
        self.assertEqual(self.d(pre("TodoWrite")), "Updating the to-do list")
        self.assertEqual(self.d({"hook_event_name": "Stop"}), "Done, resting")
        self.assertEqual(self.d({"hook_event_name": "UserPromptSubmit", "prompt": "hi"}), "Got a new task")

    def test_secrets_say_private_file(self):
        self.assertEqual(self.d(pre("Read", file_path=os.path.expanduser("~/.ssh/id_ed25519"))),
                         "Working with a private file")
        self.assertEqual(self.d(pre("Bash", command="cat ~/.ssh/config", description="Show ssh config")),
                         "Working with a private file")
        self.assertEqual(self.d(pre("Bash", command="ls", description="Look inside .env file")),
                         "Working with a private file")

    def test_doing_is_one_short_line(self):
        r = self.d(pre("Bash", command="ls", description="word " * 40))
        self.assertLessEqual(len(r), 60)
        self.assertNotIn("\n", self.d(pre("Bash", command="ls", description="two\nlines")))
