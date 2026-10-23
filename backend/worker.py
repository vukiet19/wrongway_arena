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


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sys.path.insert(0, manifest["reference"])
    from arena import run_match
    from environment import Environment

    folder = Path(sys.argv[1]).parent
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
