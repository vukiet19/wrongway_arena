"""Bridge the unchanged course Arena to newline-delimited control/events.

This process is intentionally stdlib-only. Agent modules are imported exclusively
by the course StudentAgent workers, never by the web server.
"""

import json
import sys
from pathlib import Path


class Stopped(Exception):
    pass


def emit(event):
    print(json.dumps(event, ensure_ascii=True, allow_nan=False), flush=True)


def advance():
    emit({"type": "ready"})
    line = sys.stdin.readline()
    if not line or json.loads(line).get("type") != "next":
        raise Stopped


def run_human_match(manifest, folder, Environment, StudentAgent):
    human_side = manifest["human_side"]
    agent_side = 1 - human_side
    environment = Environment(max_turns=manifest["max_turns"])
    players = [
        {
            "id": side,
            "name": "Bạn" if side == human_side else manifest["names"][0],
            "kind": "human" if side == human_side else "agent",
        }
        for side in (0, 1)
    ]
    config = {
        "timeout": 1.0,
        "startup_timeout": 5.0,
        "max_turns": manifest["max_turns"],
        "seed": manifest["seed"],
        "starting_player": 0,
    }
    emit(
        {
            "type": "round_start",
            "round": 0,
            "players": players,
            "config": config,
            "initial_state": environment.snapshot(),
        }
    )
    replay = {
        "format_version": 1,
        "players": players,
        "config": config,
        "initial_state": environment.snapshot(),
        "turns": [],
        "stats": [{"ok": 0, "pass": 0, "invalid": 0, "timeout": 0, "error": 0} for _ in range(2)],
    }
    agent_path = folder / "agent_0.py"
    agent = StudentAgent(
        agent_path, timeout=1.0, startup_timeout=5.0, seed=manifest["seed"] * 2 + agent_side
    )

    def record_turn(player, update, status, elapsed, error=None):
        record = {
            "turn": environment.turn_count,
            "player": player,
            "action": update["action"],
            "status": status,
            "reason": update.get("reason"),
            "error": error,
            "elapsed": round(elapsed, 6),
            "state": environment.snapshot(),
        }
        replay["stats"][player][status] += 1
        replay["turns"].append(record)
        emit({"type": "turn", "round": 0, "record": record})

    def legal_human_action(action, observation):
        if not isinstance(action, dict):
            return False
        if action.get("type") == "move":
            destination = action.get("to")
            return (
                isinstance(destination, list)
                and len(destination) == 2
                and all(type(value) is int for value in destination)
                and destination in observation["legal_moves"]
            )
        if action.get("type") == "wall":
            orientation, row, col = (
                action.get("orientation"),
                action.get("row"),
                action.get("col"),
            )
            return (
                orientation in ("H", "V")
                and type(row) is int
                and type(col) is int
                and {"orientation": orientation, "row": row, "col": col}
                in observation["legal_walls"]
            )
        return False

    try:
        while not environment.done:
            player = environment.current_player
            if player == agent_side:
                response = agent.act(environment.get_observation(player))
                if response.status == "ok":
                    update = environment.step(response.action)
                    status = update["status"]
                    error = update.get("reason") if status == "invalid" else None
                else:
                    update = environment.skip_turn(response.status)
                    status, error = response.status, response.error
                record_turn(player, update, status, response.elapsed, error)
                continue

            observation = environment.get_observation(player)
            state_turn = environment.turn_count
            emit(
                {
                    "type": "human_turn",
                    "round": 0,
                    "state_turn": state_turn,
                    "state": environment.snapshot(),
                    "legal_moves": observation["legal_moves"],
                    "legal_walls": observation["legal_walls"],
                }
            )
            line = sys.stdin.readline()
            if not line:
                raise Stopped
            try:
                message = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                message = {}
            if not isinstance(message, dict):
                message = {}
            if message.get("type") == "stop":
                raise Stopped
            action_turn = message.get("state_turn")
            action = message.get("action")
            if type(action_turn) is not int or action_turn != state_turn:
                reason = "stale_turn"
            elif not legal_human_action(action, observation):
                reason = "illegal_action"
            else:
                update = environment.step(action)
                record_turn(player, update, update["status"], 0.0)
                continue
            emit({"type": "action_rejected", "state_turn": state_turn, "reason": reason})

        replay.update(
            {
                "winner": environment.winner,
                "winner_name": (
                    players[environment.winner]["name"] if environment.winner is not None else None
                ),
                "reason": environment.termination_reason,
                "total_turns": environment.turn_count,
                "final_state": environment.snapshot(),
            }
        )
        emit({"type": "round_end", "round": 0, "replay": replay})
        emit({"type": "complete"})
    finally:
        agent.close()


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sys.path.insert(0, manifest["reference"])
    from agent_runner import StudentAgent
    from arena import run_match
    from environment import Environment

    folder = Path(sys.argv[1]).parent
    if manifest.get("mode", "agent-vs-agent") == "human-vs-agent":
        run_human_match(manifest, folder, Environment, StudentAgent)
        return
    for round_index in range(manifest["rounds"]):
        order = [0, 1] if round_index == 0 else [1, 0]
        paths = [folder / f"agent_{index}.py" for index in order]
        players = [
            {"id": side, "name": manifest["names"][index], "agent": index}
            for side, index in enumerate(order)
        ]
        config = {
            "timeout": 1.0,
            "startup_timeout": 5.0,
            "max_turns": manifest["max_turns"],
            "seed": manifest["seed"],
            "starting_player": 0,
        }
        emit(
            {
                "type": "round_start",
                "round": round_index,
                "players": players,
                "config": config,
                "initial_state": Environment(config["max_turns"]).snapshot(),
            }
        )
        advance()

        def on_turn(record, current_round=round_index):
            emit({"type": "turn", "round": current_round, "record": record})
            if not record["state"]["done"]:
                advance()

        replay = run_match(*paths, **config, on_turn=on_turn)
        replay["players"] = players
        replay["winner_name"] = (
            players[replay["winner"]]["name"] if replay["winner"] is not None else None
        )
        emit({"type": "round_end", "round": round_index, "replay": replay})
    emit({"type": "complete"})


if __name__ == "__main__":
    try:
        main()
    except Stopped:
        emit({"type": "stopped"})
    except Exception as exc:
        emit({"type": "failed", "message": f"{type(exc).__name__}: {str(exc)[:500]}"})
        raise SystemExit(1) from exc
