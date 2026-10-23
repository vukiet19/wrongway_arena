"""Real course-engine integration; no agent code runs inside the API process."""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import MAX_SOURCE_BYTES, create_app

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT.parent / "wrongway"
RACER = (ROOT / "public/examples/runner.py").read_bytes()


@pytest.fixture
def client(tmp_path):
    if not (REFERENCE / "arena.py").exists():
        pytest.skip(
            "Course reference not installed; set up the original Arena for integration tests"
        )
    with TestClient(create_app(REFERENCE, tmp_path / "matches")) as value:
        value.headers["X-Arena-Token"] = value.get("/api/health").json()["token"]
        yield value


def create(client, a=RACER, b=RACER, rounds=1, max_turns=30, filename="agent.py"):
    return client.post(
        "/api/sessions",
        files={
            "agent_a": (filename, a, "text/x-python"),
            "agent_b": ("other.py", b, "text/x-python"),
        },
        data={"rounds": rounds, "max_turns": max_turns, "seed": 0},
    )


def test_health_and_auth_boundaries(tmp_path):
    with TestClient(create_app(REFERENCE, tmp_path)) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["timeout"] == 1.0
        assert health.json()["startup_timeout"] == 5.0
        assert health.json()["rules"] == {"board_size": 9, "goal_rows": [0, 8]}
        assert client.post("/api/sessions").status_code == 401
        assert (
            client.get("/api/health", headers={"Origin": "https://untrusted.example"}).status_code
            == 403
        )
        assert client.get("/api/health", headers={"Host": "rebound.example"}).status_code == 400
        assert (
            client.options(
                "/api/sessions",
                headers={
                    "Origin": "https://vukiet19.github.io",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "X-Arena-Token",
                },
            ).status_code
            == 200
        )


def test_missing_reference_is_explicit(tmp_path):
    with TestClient(create_app(tmp_path, tmp_path / "matches")) as client:
        assert client.get("/api/health").json()["status"] == "missing_engine"


@pytest.mark.parametrize(
    "source,filename,status",
    [
        (b"bad python !", "test.py", 422),
        (b"x = 2", "test.py", 422),
        (b"async def choose_action(o): pass", "test.py", 422),
        (RACER, "test.txt", 422),
        (b"", "test.py", 413),
        (b"x" * (MAX_SOURCE_BYTES + 1), "test.py", 413),
    ],
    ids=["syntax", "missing-function", "async-function", "extension", "empty", "oversized"],
)
def test_invalid_uploads_rejected(client, source, filename, status):
    assert create(client, a=source, filename=filename).status_code == status
    assert not client.app.state.manager.sessions


def test_validation_does_not_execute_uploaded_code(client, tmp_path):
    marker = tmp_path / "must-not-exist.txt"
    source = f"from pathlib import Path\nPath({str(marker)!r}).write_text('executed')\n{RACER.decode()}".encode()
    response = create(client, a=source, filename="../../escape.py")
    assert response.status_code == 201
    session_id = response.json()["id"]
    assert not marker.exists()
    session = client.app.state.manager.sessions[session_id]
    assert session.manifest["names"][0] == "escape.py"
    assert (session.folder / "agent_0.py").exists()
    assert not (session.folder.parent / "escape.py").exists()
    assert client.delete(f"/api/sessions/{session_id}").status_code == 204
    assert not session.folder.exists()
    assert session.process.returncode is not None


def test_paired_match_and_original_replay(client):
    response = create(client, rounds=2)
    assert response.status_code == 201
    session_id = response.json()["id"]
    initial = response.json()["events"][0]
    assert initial["initial_state"]["board_size"] == 9
    assert initial["initial_state"]["goal_rows"] == [0, 8]
    assert initial["initial_state"]["turn"] == 0
    assert [p["agent"] for p in initial["players"]] == [0, 1]
    ended, starts = [], [initial]
    for _ in range(60):
        response = client.post(f"/api/sessions/{session_id}/step")
        assert response.status_code == 200, response.text
        batch = response.json()
        ended.extend(e for e in batch["events"] if e["type"] == "round_end")
        starts.extend(e for e in batch["events"] if e["type"] == "round_start")
        if batch["status"] == "complete":
            break
    assert len(ended) == 2
    assert [p["agent"] for p in starts[1]["players"]] == [1, 0]
    for index in (0, 1):
        replay = client.get(f"/api/sessions/{session_id}/replay/{index}").json()
        assert replay["format_version"] == 1
        assert replay["winner"] is not None
        assert replay["final_state"]["done"]
        assert all("path" not in player for player in replay["players"])
        assert all(turn["status"] == "ok" for turn in replay["turns"])
        assert replay["config"]["timeout"] == 1.0


def test_timeout_consumes_one_turn_and_restarts(client):
    source = b"def choose_action(o):\n    while True: pass\n"
    session_id = create(client, a=source, max_turns=4).json()["id"]
    first = client.post(f"/api/sessions/{session_id}/step").json()["events"][0]
    assert first["record"]["status"] == "timeout"
    assert first["record"]["state"]["positions"][0] == [8, 4]
    assert first["record"]["state"]["turn"] == 1
    second = client.post(f"/api/sessions/{session_id}/step").json()["events"][0]
    assert second["record"]["status"] == "ok"
    third = client.post(f"/api/sessions/{session_id}/step").json()["events"][0]
    assert third["record"]["status"] == "timeout"
    assert third["record"]["state"]["turn"] == 3


def test_exception_and_invalid_action_are_recorded(client):
    bad = b"def choose_action(o):\n    raise ValueError('test error')\n"
    invalid = b"def choose_action(o):\n    return {'type':'move','to':[99,99]}\n"
    session_id = create(client, a=bad, b=invalid, max_turns=2).json()["id"]
    one = client.post(f"/api/sessions/{session_id}/step").json()
    two = client.post(f"/api/sessions/{session_id}/step").json()
    assert one["events"][0]["record"]["status"] == "error"
    assert two["events"][0]["record"]["status"] == "invalid"
    assert two["status"] == "complete"
    assert client.get(f"/api/sessions/{session_id}/replay/0").json()["winner"] is None


def test_startup_uses_separate_five_second_limit(client):
    source = b"import time\ntime.sleep(20)\ndef choose_action(o): return {'type':'pass'}\n"
    session_id = create(client, a=source).json()["id"]
    started = time.monotonic()
    response = client.post(f"/api/sessions/{session_id}/step")
    assert 4.8 < time.monotonic() - started < 7
    record = response.json()["events"][0]["record"]
    assert record["status"] == "timeout"
    assert "startup limit" in record["error"]
    assert record["state"]["turn"] == 1


def test_pause_is_compute_free_and_cancel_cleans_worker(client):
    session_id = create(client).json()["id"]
    session = client.app.state.manager.sessions[session_id]
    client.post(f"/api/sessions/{session_id}/step")
    snapshot = client.get(f"/api/sessions/{session_id}").json()
    time.sleep(0.05)
    assert client.get(f"/api/sessions/{session_id}").json() == snapshot
    assert client.delete(f"/api/sessions/{session_id}").status_code == 204
    assert session.process.returncode is not None
    assert not session.folder.exists()
    assert client.get(f"/api/sessions/{session_id}").status_code == 404


def test_session_limit(client):
    for _ in range(4):
        assert create(client).status_code == 201
    assert create(client).status_code == 409
