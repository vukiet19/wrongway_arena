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


def create_human(client, source=RACER, side=0, max_turns=30):
    return client.post(
        "/api/sessions",
        files=upload(source=source),
        data={"mode": "human-vs-agent", "human_side": side, "max_turns": max_turns},
    )


def submit(client, session_id, prompt, action, state_turn=None):
    return client.post(
        f"/api/sessions/{session_id}/action",
        json={
            "state_turn": prompt["state_turn"] if state_turn is None else state_turn,
            "action": action,
        },
    )


def test_human_bottom_prompt_move_agent_reply(client):
    response = create_human(client)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    events = response.json()["events"]
    prompt = next(event for event in events if event["type"] == "human_turn")
    assert prompt["state_turn"] == 0
    assert prompt["state"]["current_player"] == 0
    assert prompt["legal_moves"]
    assert prompt["legal_walls"]

    moved = submit(client, session_id, prompt, {"type": "move", "to": prompt["legal_moves"][0]})
    assert moved.status_code == 200, moved.text
    batch = moved.json()
    turns = [event["record"] for event in batch["events"] if event["type"] == "turn"]
    assert [record["player"] for record in turns] == [0, 1]
    assert [record["status"] for record in turns] == ["ok", "ok"]
    next_prompt = next(event for event in batch["events"] if event["type"] == "human_turn")
    assert next_prompt["state_turn"] == 2


def test_human_wall_actions_follow_engine_legal_lists(client):
    for orientation in ("H", "V"):
        response = create_human(client)
        session_id = response.json()["id"]
        prompt = next(event for event in response.json()["events"] if event["type"] == "human_turn")
        wall = next(item for item in prompt["legal_walls"] if item["orientation"] == orientation)
        action = {"type": "wall", **wall}
        batch = submit(client, session_id, prompt, action)
        assert batch.status_code == 200, batch.text
        record = next(
            event["record"] for event in batch.json()["events"] if event["type"] == "turn"
        )
        assert record["action"] == action
        assert record["status"] == "ok"
        assert batch.json()["status"] == "waiting_human"
        client.delete(f"/api/sessions/{session_id}")


def test_stale_and_illegal_human_actions_do_not_advance_turn(client):
    response = create_human(client)
    session_id = response.json()["id"]
    prompt = next(event for event in response.json()["events"] if event["type"] == "human_turn")

    stale = submit(client, session_id, prompt, {"type": "move", "to": prompt["legal_moves"][0]}, -1)
    assert stale.status_code == 200
    rejected = next(event for event in stale.json()["events"] if event["type"] == "action_rejected")
    assert rejected["reason"] == "stale_turn"
    fresh_prompt = next(event for event in stale.json()["events"] if event["type"] == "human_turn")
    assert fresh_prompt["state_turn"] == 0

    illegal = submit(client, session_id, fresh_prompt, {"type": "move", "to": [4, 4]})
    assert illegal.status_code == 200
    assert next(event for event in illegal.json()["events"] if event["type"] == "action_rejected")
    assert (
        next(event for event in illegal.json()["events"] if event["type"] == "human_turn")[
            "state_turn"
        ]
        == 0
    )
    assert client.get(f"/api/sessions/{session_id}").json()["events"][-1]["state"]["turn"] == 0


def test_top_side_agent_opens_before_human_prompt(client):
    response = create_human(client, side=1, max_turns=2)
    assert response.status_code == 201, response.text
    events = response.json()["events"]
    first_turn = next(event["record"] for event in events if event["type"] == "turn")
    prompt = next(event for event in events if event["type"] == "human_turn")
    assert first_turn["player"] == 0
    assert first_turn["status"] == "ok"
    assert prompt["state_turn"] == 1
    session = client.app.state.manager.sessions[response.json()["id"]]
    assert session.manifest["human_side"] == 1
    finished = submit(
        client, response.json()["id"], prompt, {"type": "move", "to": prompt["legal_moves"][0]}
    )
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "complete"
    summary = next(
        event["summary"] for event in finished.json()["events"] if event["type"] == "round_end"
    )
    assert summary["winner"] is None
    assert summary["reason"] == "max_turns"
    replay = client.get(f"/api/sessions/{response.json()['id']}/replay/0").json()
    assert replay["format_version"] == 1
    assert [player["kind"] for player in replay["players"]] == ["agent", "human"]


def test_human_goal_win_is_included_in_v1_replay(client):
    passing_agent = b"def choose_action(observation):\n    return {'type': 'pass'}\n"
    response = create_human(client, source=passing_agent, max_turns=30)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    events = response.json()["events"]

    for _ in range(8):
        prompt = next(event for event in events if event["type"] == "human_turn")
        destination = min(prompt["legal_moves"], key=lambda cell: cell[0])
        result = submit(client, session_id, prompt, {"type": "move", "to": destination})
        assert result.status_code == 200, result.text
        events = result.json()["events"]

    assert result.json()["status"] == "complete"
    summary = next(event["summary"] for event in events if event["type"] == "round_end")
    assert summary["winner"] == 0
    assert summary["winner_name"] == "Bạn"
    replay = client.get(f"/api/sessions/{session_id}/replay/0").json()
    assert replay["final_state"]["termination_reason"] == "goal"
    assert [player["kind"] for player in replay["players"]] == ["human", "agent"]


def test_agent_timeout_is_recorded_after_human_move(client):
    slow = b"def choose_action(observation):\n    while True: pass\n"
    response = create_human(client, source=slow, max_turns=4)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    prompt = next(event for event in response.json()["events"] if event["type"] == "human_turn")
    batch = submit(client, session_id, prompt, {"type": "move", "to": prompt["legal_moves"][0]})
    assert batch.status_code == 200, batch.text
    timeout_record = next(
        event["record"]
        for event in batch.json()["events"]
        if event["type"] == "turn" and event["record"]["player"] == 1
    )
    assert timeout_record["status"] == "timeout"
    assert timeout_record["state"]["turn"] == 2


def test_wrong_mode_and_out_of_turn_actions_are_rejected(client):
    normal = create_agents(client)
    normal_id = normal.json()["id"]
    response = client.post(
        f"/api/sessions/{normal_id}/action", json={"state_turn": 0, "action": {"type": "pass"}}
    )
    assert response.status_code == 409

    human = create_human(client)
    human_id = human.json()["id"]
    session = client.app.state.manager.sessions[human_id]
    session.status = "thinking"
    response = client.post(
        f"/api/sessions/{human_id}/action", json={"state_turn": 0, "action": {"type": "pass"}}
    )
    assert response.status_code == 409
    session.status = "waiting_human"


def test_cancel_while_waiting_for_human_cleans_worker(client):
    response = create_human(client)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    session = client.app.state.manager.sessions[session_id]
    assert session.status == "waiting_human"
    assert client.delete(f"/api/sessions/{session_id}").status_code == 204
    assert session.process.returncode is not None
    assert not session.folder.exists()


def create_agents(client):
    return client.post(
        "/api/sessions",
        files=upload() | upload("agent_b", "second.py"),
        data={"rounds": 1, "max_turns": 4},
    )


def test_agent_error_is_recorded_after_human_move(client):
    broken = b"def choose_action(observation):\n    raise ValueError('agent failure')\n"
    response = create_human(client, source=broken, max_turns=4)
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]
    prompt = next(event for event in response.json()["events"] if event["type"] == "human_turn")
    batch = submit(client, session_id, prompt, {"type": "move", "to": prompt["legal_moves"][0]})
    assert batch.status_code == 200, batch.text
    error_record = next(
        event["record"]
        for event in batch.json()["events"]
        if event["type"] == "turn" and event["record"]["player"] == 1
    )
    assert error_record["status"] == "error"
    assert "ValueError" in error_record["error"]
    assert error_record["state"]["turn"] == 2
