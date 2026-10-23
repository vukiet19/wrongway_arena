"""Loopback-first API; arbitrary Python uploads require trusted local users."""

import ast
import asyncio
import hashlib
import os
import re
import secrets
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .manager import ROOT, Manager, MatchFailure

MAX_SOURCE_BYTES = 256 * 1024
ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://vukiet19.github.io",
]


def clean_name(filename):
    filename = (filename or "agent.py").replace("\\", "/").rsplit("/", 1)[-1]
    return re.sub(r"[^\w. ()-]", "_", filename)[:80] or "agent.py"


def validate_source(source, filename):
    if not filename.lower().endswith(".py"):
        raise HTTPException(422, "Chỉ nhận file Python có đuôi .py.")
    if not source or len(source) > MAX_SOURCE_BYTES:
        raise HTTPException(413, "Mỗi file phải có nội dung và nhỏ hơn 256 KB.")
    try:
        tree = ast.parse(source)
    except (SyntaxError, UnicodeError, ValueError) as exc:
        raise HTTPException(422, f"{filename}: không đọc được cú pháp Python.") from exc
    if not any(
        isinstance(node, ast.FunctionDef) and node.name == "choose_action" for node in tree.body
    ):
        raise HTTPException(422, f"{filename}: thiếu hàm choose_action(observation).")


def create_app(reference=None, data_dir=None):
    reference = Path(
        reference or os.environ.get("WRONGWAY_REFERENCE", ROOT.parent / "wrongway")
    ).resolve()
    data_dir = Path(data_dir or ROOT / ".local/matches").resolve()
    manager = Manager(reference, data_dir)
    token = secrets.token_urlsafe(32)
    origins = ORIGINS + [
        value.strip() for value in os.environ.get("ARENA_ORIGINS", "").split(",") if value.strip()
    ]

    @asynccontextmanager
    async def lifespan(_app):
        async def cleanup():
            while True:
                await asyncio.sleep(60)
                await manager.expire()

        task = asyncio.create_task(cleanup())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            await manager.close()

    app = FastAPI(title="Wrongway Arena", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.manager = manager
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-Arena-Token"],
    )

    @app.middleware("http")
    async def local_access(request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and origin not in origins:
                return JSONResponse({"detail": "Origin không được phép kết nối."}, status_code=403)
            if request.method != "OPTIONS" and request.url.path != "/api/health":
                supplied = request.headers.get("x-arena-token", "")
                if not secrets.compare_digest(supplied, token):
                    return JSONResponse({"detail": "Hãy kết nối lại với backend."}, status_code=401)
            length = request.headers.get("content-length")
            if length:
                try:
                    oversized = int(length) > 2 * MAX_SOURCE_BYTES + 64 * 1024
                except ValueError:
                    return JSONResponse({"detail": "Content-Length không hợp lệ."}, status_code=400)
                if oversized:
                    return JSONResponse(
                        {"detail": "Tổng dung lượng upload quá lớn."}, status_code=413
                    )
        return await call_next(request)

    @app.get("/api/health")
    def health():
        files = ["arena.py", "environment.py", "agent_runner.py", "visualizer.py"]
        available = all((reference / name).is_file() for name in files)
        return {
            "status": "ready" if available else "missing_engine",
            "token": token,
            "engine_available": available,
            "mode": "trusted-local",
            "rules": {"board_size": 9, "goal_rows": [0, 8]},
            "timeout": 1.0,
            "startup_timeout": 5.0,
            "engine_sha256": {
                name: hashlib.sha256((reference / name).read_bytes()).hexdigest() for name in files
            }
            if available
            else {},
        }

    def get_session(session_id):
        session = manager.sessions.get(session_id)
        if not session:
            raise HTTPException(404, "Trận đã đóng hoặc hết hạn. Hãy tạo trận mới.")
        return session

    @app.post("/api/sessions", status_code=201)
    async def create_session(
        agent_a: Annotated[UploadFile, File()],
        agent_b: Annotated[UploadFile, File()],
        rounds: Annotated[int, Form(ge=1, le=2)] = 2,
        seed: Annotated[int, Form(ge=0, le=2**31 - 1)] = 0,
        max_turns: Annotated[int, Form(ge=2, le=500)] = 500,
    ):
        if not (reference / "arena.py").is_file():
            raise HTTPException(503, "Không tìm thấy bộ Arena. Kiểm tra WRONGWAY_REFERENCE.")
        sources = [await file.read(MAX_SOURCE_BYTES + 1) for file in (agent_a, agent_b)]
        names = [clean_name(file.filename) for file in (agent_a, agent_b)]
        for source, name in zip(sources, names, strict=True):
            validate_source(source, name)
        try:
            session = await manager.create(sources, names, rounds, seed, max_turns)
        except MatchFailure as exc:
            raise HTTPException(409, str(exc)) from exc
        return {
            "id": session.id,
            "status": session.status,
            "rounds": session.manifest["rounds"],
            "events": session.events,
        }

    @app.post("/api/sessions/{session_id}/step")
    async def step(session_id: str):
        session = get_session(session_id)
        if session.lock.locked():
            raise HTTPException(409, "Agent đang suy nghĩ, hãy chờ lượt hiện tại.")
        async with session.lock, manager.compute:
            try:
                events = await session.step()
            except (MatchFailure, BrokenPipeError, ConnectionResetError) as exc:
                raise HTTPException(409, str(exc)) from exc
        return {"status": session.status, "events": events}

    @app.get("/api/sessions/{session_id}")
    def session_state(session_id: str):
        session = get_session(session_id)
        session.touched = time.monotonic()
        return {
            "id": session.id,
            "status": session.status,
            "rounds": session.manifest["rounds"],
            "events": session.events,
        }

    @app.get("/api/sessions/{session_id}/replay/{round_index}")
    def replay(session_id: str, round_index: int):
        session = get_session(session_id)
        session.touched = time.monotonic()
        if round_index not in session.replays:
            raise HTTPException(409, "Ván này chưa hoàn thành.")
        return session.replays[round_index]

    @app.delete("/api/sessions/{session_id}", status_code=204)
    async def cancel(session_id: str):
        await manager.remove(session_id)

    if (ROOT / "dist").is_dir():
        app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
    return app


app = create_app()
