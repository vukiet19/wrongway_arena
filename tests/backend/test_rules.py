"""The web Arena crosses both old goal lines without changing course files."""

import importlib
from pathlib import Path

import pytest

from backend.rules import install_beyond_line_rules

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT.parent / "wrongway"


@pytest.fixture(scope="module")
def environment_type():
    if not (REFERENCE / "environment.py").is_file():
        pytest.skip("Course reference is unavailable")
    return install_beyond_line_rules(REFERENCE)


def test_new_finish_squares_are_past_both_original_edges(environment_type):
    env = environment_type()
    state = env.snapshot()
    observation = env.get_observation(0)
    assert state["board_rows"] == 11
    assert state["board_cols"] == 9
    assert state["row_offset"] == -1
    assert state["positions"] == [[9, 4], [1, 4]]
    assert state["goal_rows"] == [0, 10]
    assert len(observation["distances"]) == 11
    assert all(len(row) == 9 for row in observation["distances"])
    assert observation["board_rows"] == 11


@pytest.mark.parametrize(
    "player,positions,approach,finish",
    [
        (0, [(2, 4), (8, 4)], (1, 4), (0, 4)),
        (1, [(2, 4), (8, 4)], (9, 4), (10, 4)),
    ],
    ids=["cross-top-line", "cross-bottom-line"],
)
def test_crossing_old_line_does_not_win_until_extra_step(
    environment_type, player, positions, approach, finish
):
    env = environment_type()
    env.positions = positions
    env.current_player = player
    first = env.step({"type": "move", "to": list(approach)})
    assert first["status"] == "ok"
    assert not first["done"]
    assert first["winner"] is None

    env.current_player = player
    second = env.step({"type": "move", "to": list(finish)})
    assert second["status"] == "ok"
    assert second["done"]
    assert second["winner"] == player
    assert second["reason"] == "move"


def test_rectangular_wall_edges_stay_inside_the_board(environment_type):
    env = environment_type()
    legal = env.legal_wall_actions()
    assert {"orientation": "H", "row": 9, "col": 7} in legal
    assert {"orientation": "V", "row": 9, "col": 7} in legal
    result = env.step({"type": "wall", "orientation": "V", "row": 9, "col": 8})
    assert result["status"] == "invalid"
    assert result["reason"] == "invalid_wall_coordinates"


def test_course_engine_file_is_not_changed():
    if not (REFERENCE / "environment.py").is_file():
        pytest.skip("Course reference is unavailable")
    source = (REFERENCE / "environment.py").read_text(encoding="utf-8")
    assert "BOARD_SIZE = 9" in source
    course_engine = importlib.import_module("environment")
    assert course_engine.BOARD_SIZE == 11  # Runtime change lives in this test process only.
