import signal
import subprocess

import pytest

from local_services import application


def test_hung_initializer_is_bounded_and_reaped_with_all_services(monkeypatch):
    children, signals = [], []
    ticks = iter(range(0, 2000, 200))

    class Child:
        def __init__(self, *args, **kwargs):
            self.pid = len(children) + 1
            self.killed = False
            self.returncode = None
            children.append(self)

        def poll(self):
            return self.returncode

        def wait(self, timeout=None):
            if not self.killed:
                raise subprocess.TimeoutExpired("test child", timeout)
            self.returncode = -9
            return self.returncode

    class Event:
        def is_set(self):
            return False

        def wait(self, seconds):
            return False

    def send(pid, sig):
        signals.append((pid, sig))
        if sig == signal.SIGKILL:
            children[pid - 1].killed = True
        elif pid == 2:
            # An exit between poll() and killpg() must not skip other children.
            raise ProcessLookupError()

    monkeypatch.setattr(application.subprocess, "Popen", Child)
    monkeypatch.setattr(application, "wait_ready", lambda *a, **k: None)
    monkeypatch.setattr(application.threading, "Event", Event)
    monkeypatch.setattr(application.signal, "signal", lambda *a: None)
    monkeypatch.setattr(application.time, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(application.signal, "SIGKILL", 9, raising=False)
    monkeypatch.setattr(application.os, "killpg", send, raising=False)
    monkeypatch.setenv("RUNTIME_BACKEND", "local")
    with pytest.raises(RuntimeError, match="initialization deadline"):
        application.main()
    assert len(children) == 4
    assert {pid for pid, sig in signals if sig == signal.SIGKILL} == {1, 2, 3, 4}
    assert all(child.returncode == -9 for child in children)
