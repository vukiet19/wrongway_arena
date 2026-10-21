"""Demo agent: race, occasionally interrupting an opponent near its goal."""


def choose_action(observation):
    moves = observation["legal_moves"]
    goal = observation["you"]["goal_row"]
    for move in moves:
        if move[0] == goal:
            return {"type": "move", "to": move}
    other = observation["opponent"]
    row, col = other["position"]
    if abs(other["goal_row"] - row) <= 3 and observation["turn"] % 4 == 1:
        edge = row if other["goal_row"] > row else row - 1
        for wall in observation["legal_walls"]:
            if wall["orientation"] == "H" and wall["row"] == edge and wall["col"] <= col <= wall["col"] + 1:
                return dict(wall, type="wall")
    if not moves:
        return {"type": "pass"}
    distances = observation["distances"]
    target = min(moves, key=lambda p: (distances[p[0]][p[1]], abs(p[1] - 4)))
    return {"type": "move", "to": target}
