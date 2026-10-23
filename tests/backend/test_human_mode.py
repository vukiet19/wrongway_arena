from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.manager import Session

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT.parent / "wrongway"
RACER = (ROOT / "public/examples/runner.py").read_bytes()


@pytest.fixture
def client(tmp_path):
    if not (REFERENCE / "arena.py").exists():
        pytest.skip("Course reference not installed")
    with TestClient(create_app(REFERENCE, tmp_path / "matches")) as value:
        value.headers["X-Arena-Token"] = value.get("/api/health").json()["token"]
        yield value


def upload(name="agent_a", filename="agent.py", source=RACER):
    return {name: (filename, source, "text/x-python")}


def test_human_mode_accepts_one_agent_and_persists_configuration(client, monkeypatch):
    monkeypatch.setattr(Session, "start", AsyncMock())
    response = client.post(
        "/api/sessions",
        files=upload(),
        data={"mode": "human-vs-agent", "human_side": 0, "rounds": 2, "seed": 5},
    )

    assert response.status_code == 201, response.text
    session = client.app.state.manager.sessions[response.json()["id"]]
    assert session.manifest["mode"] == "human-vs-agent"
    assert session.manifest["human_side"] == 0
    assert session.manifest["rounds"] == 1
    assert session.manifest["names"] == ["agent.py"]


def test_human_mode_requires_agent(client):
    response = client.post("/api/sessions", data={"mode": "human-vs-agent", "human_side": 0})
    assert response.status_code == 422
    assert not client.app.state.manager.sessions


def test_human_mode_rejects_second_agent(client):
    files = upload() | upload("agent_b", "second.py")
    response = client.post(
        "/api/sessions",
        files=files,
        data={"mode": "human-vs-agent", "human_side": 0},
    )
    assert response.status_code == 422
    assert not client.app.state.manager.sessions


@pytest.mark.parametrize("side", [-1, 2, "north"])
def test_human_mode_rejects_invalid_side(client, side):
    response = client.post(
        "/api/sessions",
        files=upload(),
        data={"mode": "human-vs-agent", "human_side": side},
    )
    assert response.status_code == 422
    assert not client.app.state.manager.sessions


def test_unknown_mode_is_rejected(client):
    response = client.post(
        "/api/sessions", files=upload(), data={"mode": "human-vs-human", "human_side": 0}
    )
    assert response.status_code == 422
    assert not client.app.state.manager.sessions


def test_agent_mode_keeps_two_upload_creation(client):
    response = client.post(
        "/api/sessions",
        files=upload() | upload("agent_b", "second.py"),
        data={"rounds": 2, "seed": 11, "max_turns": 10},
    )
    assert response.status_code == 201, response.text
    session = client.app.state.manager.sessions[response.json()["id"]]
    assert session.manifest["mode"] == "agent-vs-agent"
    assert session.manifest["human_side"] is None
    assert session.manifest["rounds"] == 2
