"""Demo agent: follow the shortest available route; no external dependencies."""


def choose_action(observation):
    moves = observation["legal_moves"]
    distances = observation["distances"]
    if not moves:
        return {"type": "pass"}
    target = min(moves, key=lambda p: (distances[p[0]][p[1]], abs(p[1] - 4)))
    return {"type": "move", "to": target}
