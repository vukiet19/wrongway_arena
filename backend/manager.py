"""Bounded local sessions, cooperative turn stepping, and subprocess cleanup."""

import asyncio
import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKER = Path(__file__).with_name("worker.py")
MAX_SESSIONS = 4
TTL_SECONDS = 30 * 60


class MatchFailure(Exception):
    pass


class Session:
    def __init__(self, folder, manifest):
        self.id = folder.name
        self.folder, self.manifest = folder, manifest
        self.process = None
        self.lock = asyncio.Lock()
        self.status = "preparing"
        self.events, self.replays = [], {}
        self.touched = time.monotonic()
        self.stderr_task = None
        self.stderr_tail = b""

    async def start(self):
        manifest_path = self.folder / "manifest.json"
        manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        # Do not pass API credentials or unrelated environment secrets to agents.
        env = {
            key: os.environ[key] for key in ("SYSTEMROOT", "WINDIR", "PATH") if key in os.environ
        }
        env.update(
            {
                "PYTHONIOENCODING": "utf-8",
                "PYTHONDONTWRITEBYTECODE": "1",
                "TEMP": str(self.folder),
                "TMP": str(self.folder),
            }
        )
        options = (
            {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
            if os.name == "nt"
            else {"start_new_session": True}
        )
        self.process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            str(WORKER),
            str(manifest_path),
            cwd=self.folder,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=4 * 1024 * 1024,
            **options,
        )
        self.stderr_task = asyncio.create_task(self._drain_stderr())
        await self._batch()

    async def _drain_stderr(self):
        while chunk := await self.process.stderr.read(4096):
            self.stderr_tail = (self.stderr_tail + chunk)[-8192:]

    async def _batch(self):
        batch = []
        while True:
            try:
                line = await asyncio.wait_for(self.process.stdout.readline(), timeout=8)
            except (TimeoutError, ValueError) as exc:
                self.status = "failed"
                await self.close()
                raise MatchFailure("Arena không phản hồi đúng hạn. Hãy tạo trận mới.") from exc
            if not line:
                self.status = "failed"
                await self.close()
                raise MatchFailure("Process Arena đã dừng trước khi hoàn thành.")
            event = json.loads(line)
            kind = event["type"]
            if kind == "ready":
                self.status = "ready"
                break
            if kind == "round_end":
                replay = event.pop("replay")
                self.replays[event["round"]] = replay
                event["summary"] = {
                    key: replay[key]
                    for key in ("winner", "winner_name", "reason", "total_turns", "stats")
                }
            batch.append(event)
            self.events.append(event)
            if kind == "human_turn":
                self.status = "waiting_human"
                break
            if kind in ("complete", "failed", "stopped"):
                self.status = kind
                if kind == "failed":
                    await self.close()
                    raise MatchFailure(event["message"])
                break
        self.touched = time.monotonic()
        return batch

    async def step(self):
        if self.status == "complete":
            return []
        if self.status != "ready":
            raise MatchFailure("Trận không còn hoạt động. Hãy tạo trận mới.")
        self.status = "thinking"
        self.process.stdin.write(b'{"type":"next"}\n')
        await self.process.stdin.drain()
        return await self._batch()

    async def submit_human_action(self, state_turn, action):
        if self.manifest.get("mode") != "human-vs-agent":
            raise MatchFailure("Trận này không nhận lượt đi của người chơi.")
        if self.status != "waiting_human":
            raise MatchFailure("Hiện không chờ lượt đi của người chơi.")
        self.status = "thinking"
        message = {"type": "human_action", "state_turn": state_turn, "action": action}
        self.process.stdin.write((json.dumps(message, allow_nan=False) + "\n").encode("utf-8"))
        await self.process.stdin.drain()
        return await self._batch()

    async def close(self):
        process = self.process
        if process and process.returncode is None:
            try:
                process.stdin.write(b'{"type":"stop"}\n')
                await process.stdin.drain()
                await asyncio.wait_for(process.wait(), 0.35)
            except (TimeoutError, BrokenPipeError, ConnectionResetError):
                if os.name == "nt":
                    killer = await asyncio.create_subprocess_exec(
                        "taskkill",
                        "/PID",
                        str(process.pid),
                        "/T",
                        "/F",
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await killer.wait()
                else:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                await process.wait()
        if self.stderr_task:
            await self.stderr_task
        if self.status not in ("complete", "failed"):
            self.status = "stopped"


class Manager:
    def __init__(self, reference, data_dir):
        self.reference, self.data_dir = reference, data_dir
        self.sessions = {}
        self.compute = asyncio.Lock()  # Keep timed agent calls sequential on this machine.

    async def create(
        self, sources, names, rounds, seed, max_turns, mode="agent-vs-agent", human_side=None
    ):
        await self.expire()
        if len(self.sessions) >= MAX_SESSIONS:
            raise MatchFailure("Đã có 4 trận đang mở. Hãy đóng một trận trước.")
        folder = self.data_dir / secrets.token_urlsafe(24)
        folder.mkdir(parents=True)
        for index, source in enumerate(sources):
            (folder / f"agent_{index}.py").write_bytes(source)
        manifest = {
            "reference": str(self.reference),
            "names": names,
            "rounds": rounds,
            "seed": seed,
            "max_turns": max_turns,
            "mode": mode,
            "human_side": human_side,
        }
        session = Session(folder, manifest)
        self.sessions[session.id] = session
        try:
            await session.start()
        except Exception:
            await self.remove(session.id)
            raise
        return session

    async def remove(self, session_id):
        session = self.sessions.pop(session_id, None)
        if session:
            async with session.lock:
                await session.close()
            resolved = session.folder.resolve()
            if not resolved.is_relative_to(self.data_dir) or resolved == self.data_dir:
                raise MatchFailure("Refusing cleanup outside the match data directory")
            shutil.rmtree(resolved, ignore_errors=True)

    async def expire(self):
        expired = [
            key
            for key, value in self.sessions.items()
            if time.monotonic() - value.touched > TTL_SECONDS and not value.lock.locked()
        ]
        for key in expired:
            await self.remove(key)

    async def close(self):
        for key in list(self.sessions):
            await self.remove(key)
