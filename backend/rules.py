"""Arena-only rule variant: win by stepping one square beyond the far edge.

The original 9x9 game area remains between logical rows 0 and 8. Logical rows
-1 and 9 are extra finish squares. The course source is imported unchanged;
only this isolated worker receives the extended environment class.
"""

import importlib
import sys
from pathlib import Path

BOARD_ROWS = 11
BOARD_COLS = 9
ROW_OFFSET = -1


def install_beyond_line_rules(reference: Path):
    """Install the extended rectangular environment before importing arena.py."""
    sys.path.insert(0, str(reference))
    game = importlib.import_module("environment")
    game.BOARD_SIZE = BOARD_ROWS
    CourseEnvironment = game.Environment

    class BeyondLineEnvironment(CourseEnvironment):
        def __init__(self, max_turns=500, starting_player=0):
            super().__init__(max_turns=max_turns, starting_player=starting_player)
            # Physical rows 1..9 correspond to the course's original 0..8.
            # The new finish rows are physical 0 and 10 (logical -1 and 9).
            self.positions = [(9, 4), (1, 4)]
            self.goal_rows = [0, 10]

        @staticmethod
        def _inside(cell):
            return 0 <= cell[0] < BOARD_ROWS and 0 <= cell[1] < BOARD_COLS

        def _adjacency(self):
            graph = {}
            for row in range(BOARD_ROWS):
                for col in range(BOARD_COLS):
                    cell = (row, col)
                    graph[cell] = [
                        (row + dr, col + dc)
                        for dr, dc in ((-1, 0), (0, -1), (0, 1), (1, 0))
                        if self._edge_open(cell, (row + dr, col + dc))
                    ]
            return graph

        def legal_wall_actions(self, player=None):
            player = self._player(player)
            if self.done or self.walls_remaining[player] <= 0:
                return []
            graph = self._adjacency()
            return [
                {"orientation": orientation, "row": row, "col": col}
                for orientation in ("H", "V")
                for row in range(BOARD_ROWS - 1)
                for col in range(BOARD_COLS - 1)
                if self._wall_error(player, orientation, row, col, graph) is None
            ]

        def distance_map(self, player):
            self._check_player(player)
            distances = [[-1] * BOARD_COLS for _ in range(BOARD_ROWS)]
            pending = []
            goal_row = self.goal_rows[player]
            for col in range(BOARD_COLS):
                distances[goal_row][col] = 0
                pending.append((goal_row, col))
            graph = self._adjacency()
            for row, col in pending:
                for next_row, next_col in graph[(row, col)]:
                    if distances[next_row][next_col] == -1:
                        distances[next_row][next_col] = distances[row][col] + 1
                        pending.append((next_row, next_col))
            return distances

        def step(self, action):
            if (
                isinstance(action, dict)
                and action.get("type") == "wall"
                and type(action.get("row")) is int
                and type(action.get("col")) is int
                and not (
                    0 <= action["row"] < BOARD_ROWS - 1 and 0 <= action["col"] < BOARD_COLS - 1
                )
            ):
                self._require_active()
                return self._finish_turn("invalid", "invalid_wall_coordinates", None)
            return super().step(action)

        def _with_dimensions(self, state):
            state.update(
                board_size=BOARD_COLS,
                board_rows=BOARD_ROWS,
                board_cols=BOARD_COLS,
                row_offset=ROW_OFFSET,
            )
            return state

        def snapshot(self):
            return self._with_dimensions(super().snapshot())

        def get_observation(self, player=None):
            return self._with_dimensions(super().get_observation(player))

    game.Environment = BeyondLineEnvironment
    return BeyondLineEnvironment
