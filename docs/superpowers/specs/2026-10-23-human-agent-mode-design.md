# Human-versus-agent mode design

Date: 2026-10-23

## Purpose

Add a local play mode where a person plays one side against one uploaded Python agent. The person can choose either side and use the same movement and wall rules as the course game. The original course engine remains authoritative; existing agent-versus-agent matches and replay format continue to work.

## Chosen approach

Keep the API as a coordinator and run the match in the existing isolated worker process. For human-versus-agent sessions, the worker owns an `Environment` from the course engine and calls the course `StudentAgent` only on the agent's turns. This uses the engine's legal-action calculations and transition logic without duplicating rules in TypeScript or executing uploaded code in the API process.

The alternatives were a synthetic agent that waits on a file/IPC bridge, which adds polling and timeout complications, and a browser-owned game engine, which risks diverging from the course rules. The worker-owned game loop is the clearest boundary and supports cancellation and trustworthy replays.

## User flow

- A mode control selects either the existing agent-versus-agent series or human-versus-agent.
- In human mode, the user uploads one `.py` agent, chooses to play from the top (player 1) or bottom (player 0), and sets the seed and turn limit. The mode runs one game; paired-series settings are hidden or disabled.
- The agent keeps the existing one-second action and five-second startup limits. A human turn waits for input without using the agent deadline.
- The board offers legal pawn destinations and wall placements. The user chooses move, horizontal wall, or vertical wall, then selects a highlighted legal target. The board never offers an action the engine did not mark legal.
- The engine starts with player 0 (bottom). If the agent is player 0, its opening turn runs automatically and the worker pauses when the human is next to move. After a human action, the worker applies it and runs the agent's reply, then pauses again at the next human turn. The match ends and replays through the existing result and replay controls.

## Backend and worker boundary

Extend session creation with an explicit mode and human side. Agent-versus-agent still requires two uploads and supports one or two paired rounds. Human-versus-agent requires one upload and one side value, and is restricted to one round. Validate these combinations before creating a session.

For a human session, the worker initializes the course `Environment`, constructs players for the human and agent, and keeps its replay state in memory. It emits a `human_turn` event containing the current public state, turn number, and engine-provided legal moves and legal wall placements, then waits for a `human_action` control message carrying that turn number and action. The worker rejects stale or illegal actions against that turn's legal-action set before calling `Environment.step`; rejection leaves the turn unchanged and returns a fresh prompt. Agent turns use the original `StudentAgent` runner and limits. Turn records retain the existing fields (`turn`, `player`, `action`, `status`, `elapsed`, and `state`), and the completed replay uses format version 1.

Add an authenticated action endpoint for human sessions. The session lock serializes action submissions and cancellation. It accepts actions only while a human turn is pending, forwards the action to the worker, and returns events through the next human prompt or game end. Agent-versus-agent sessions reject human-action requests. Existing session expiry, cancellation, and subprocess-tree cleanup remain in effect.

Replay player metadata adds an optional `kind` value (`human` or `agent`) to identify the human and uploaded agent while preserving player side IDs and format version 1. The normal agent-versus-agent scoring behavior is unchanged.

## Frontend behavior

Keep the existing agent-versus-agent setup as the default. Human mode reuses the first upload slot for the agent file, hides the second upload, and shows a top/bottom side selector. The board becomes interactive only when the current turn belongs to the human and the match is live. Legal destinations and legal wall anchors are visually marked; playback/replay navigation stays read-only. While the agent is thinking, show its turn status and block additional human input. Display backend rejection or agent timeout/error through the existing notice and match log.

## Failure handling

- Missing or invalid agent files use the existing upload validation messages.
- Invalid side/mode combinations are rejected before a worker starts.
- An unavailable engine returns the current missing-engine error.
- An illegal, stale, duplicate, or out-of-turn human action is rejected without changing the game state.
- Agent timeout, exception, and invalid response preserve course-engine semantics and are recorded in the match.
- Stopping a match while waiting for a human action closes the worker and removes its temporary files.
- If the worker exits unexpectedly, return the existing session failure response and do not fabricate a turn or winner.

## Verification

Add backend tests for the mode/upload matrix, both human sides, turn prompts, legal action application, illegal and out-of-turn submissions, agent response, timeout/error handling, replay metadata, and cancellation while awaiting a human. Add frontend tests for mode-dependent controls and legal-target selection. Add browser tests that upload one agent, play at least one move and one wall action, observe an agent reply, finish or draw a short match, and verify replay export/import. Run the existing agent-versus-agent suite unchanged to guard against regressions; run Python lint/format, frontend tests/format/build, and Playwright end-to-end tests.

## Scope limits

This adds local human-versus-agent play only. It does not add network multiplayer, deploy Python execution to GitHub Pages, change course rules, introduce a new replay version, or let a human participate in paired tournament scoring.
