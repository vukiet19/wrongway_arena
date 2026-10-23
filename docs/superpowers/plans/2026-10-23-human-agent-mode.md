# Human-versus-agent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local mode where a person plays a complete 9×9 Wrongway game against one uploaded agent, with engine-validated moves, legal wall placement, cancellation, and replay.

**Architecture:** The API coordinates sessions and authenticated human actions. A separate worker process owns the course `Environment`, pauses at human turns, runs the existing `StudentAgent` on agent turns, and emits the current replay/event format. The frontend chooses the mode and side, displays engine-supplied legal targets, and submits a move or wall action through the API.

**Tech Stack:** Python 3.12, FastAPI, course `Environment`/`StudentAgent`, TypeScript, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-human-agent-mode-design.md`

## Global Constraints

- The original course engine remains authoritative and unmodified; uploaded Python runs only in the existing worker/subprocess boundary.
- The board is 9×9; goal rows are 0 and 8.
- Agent startup remains limited to 5 seconds and each agent action to 1 second; human input has no agent-action deadline.
- Human-versus-agent mode is one game, with no paired-series tournament scoring.
- Completed games keep replay format version 1; player metadata may include `kind: "human" | "agent"`.
- Local mode stays loopback-first and retains authentication, upload/session bounds, cancellation, and subprocess cleanup.

## Review Focus

- Missing agent upload, unexpected second upload, unknown mode, or invalid human side: reject before worker creation (Task 1).
- Agent opens when the human selects the top side: automatically reach the first human prompt and preserve the correct side mapping (Task 2).
- Stale, duplicate, illegal, or out-of-turn action: reject without advancing the state (Task 2).
- Stop/expiry while the worker waits for a human action: close the worker and remove session files (Task 2).
- UI click outside current legal move/wall targets or while viewing replay/thinking: do not submit an action (Tasks 3–4).

## File Map

- `backend/app.py`: validate the mode/upload form and expose the human action endpoint.
- `backend/manager.py`: persist session mode and serialize human actions with stepping/cancellation.
- `backend/worker.py`: run the human session loop over the course `Environment` and `StudentAgent`; keep existing agent-versus-agent flow intact.
- `src/model.ts`: human player metadata and human-turn/action event types.
- `src/api.ts`: submit an authenticated human action.
- `src/main.ts`: mode/side setup, prompts, controls, and event handling.
- `src/board.ts` and `src/style.css`: render legal move targets and selectable legal wall anchors.
- `tests/backend/test_human_mode.py`: HTTP, worker protocol, action, replay, and cleanup integration tests.
- `tests/frontend/model.test.ts`: replay/event/board interaction unit tests.
- `tests/e2e/human.spec.ts`: real browser flow against the course engine.
- `README.md`: explain local human-versus-agent use.

---

### Task 1: Define and validate human session creation

**Files:**
- Modify: `backend/app.py`
- Modify: `backend/manager.py`
- Create: `tests/backend/test_human_mode.py`
- Test: `tests/backend/test_api.py`

**Interfaces:**
- Session creation accepts `mode` (`agent-vs-agent` by default or `human-vs-agent`), required `agent_a`, optional `agent_b`, optional `human_side` (0 bottom, 1 top), `seed`, and `max_turns`.
- `Manager.create(sources: list[bytes], names: list[str], rounds: int, seed: int, max_turns: int, mode: str = "agent-vs-agent", human_side: int | None = None) -> Session` stores `mode` and `human_side` in the worker manifest.
- Agent-versus-agent requires both uploads and keeps existing 1–2 round behavior. Human-versus-agent requires exactly one upload, a side of 0 or 1, and one round.

- [x] **Step 1: Write failing API validation tests**
  - Add tests for a valid human session with one agent; missing agent; second upload supplied; invalid side; unknown mode; and unchanged valid two-agent creation.
- [x] **Step 2: Run tests and verify the expected failures**
  - Run: `.venv\Scripts\python.exe -m pytest -q tests/backend/test_human_mode.py tests/backend/test_api.py`
  - Expected: human-mode form fields are rejected or ignored before implementation; existing agent-versus-agent tests pass.
- [x] **Step 3: Implement mode parsing and session manifest fields**
  - Make `agent_b` optional at the API boundary, validate the mode/upload/side matrix before creating files, force one human round, and persist `mode`/`human_side` in the manifest.
- [x] **Step 4: Re-run focused API tests**
  - Expected: all mode-matrix cases and existing session-creation tests pass.
- [x] **Step 5: Commit**
  - `feat(api): accept human versus agent sessions`

### Task 2: Run human turns through the course engine

**Files:**
- Modify: `backend/worker.py`
- Modify: `backend/manager.py`
- Modify: `backend/app.py`
- Test: `tests/backend/test_human_mode.py`

**Interfaces:**
- Worker event `human_turn` contains `round`, `state_turn` (the current `Environment.turn_count` before the action), public `state`, `legal_moves`, and `legal_walls`.
- `POST /api/sessions/{session_id}/action` accepts `{ "state_turn": int, "action": object }` and requires the session to be a human-versus-agent session waiting for input.
- `Session.submit_human_action(state_turn: int, action: dict) -> list[dict]` serializes the control message and returns events through the next human prompt or terminal result.
- Worker input `{"type":"human_action","state_turn":int,"action":object}` is accepted only if its turn matches and action is in the current observation’s legal moves or legal wall actions. Invalid input emits a rejection and a fresh prompt without changing the game.
- Human turns use the same turn-record fields as agent turns. Player metadata adds `kind`; game summaries/replays keep format version 1.

- [x] **Step 1: Write failing worker/API integration tests**
  - Test human-bottom initial prompt, human move followed by agent reply, horizontal/vertical wall legality, rejected stale/illegal action without a turn increment, top-side agent opening, agent timeout/error recording, wrong-mode/out-of-turn HTTP rejection, and cancellation while awaiting input.
- [x] **Step 2: Run the focused tests and confirm expected failures**
  - Run: `.venv\Scripts\python.exe -m pytest -q tests/backend/test_human_mode.py`
  - Expected: missing human-turn event/action endpoint or unsupported session state; existing tests remain unaffected.
- [x] **Step 3: Implement worker-owned human game loop and action protocol**
  - Keep `run_match()` for agent-versus-agent sessions. For human mode, use the course `Environment` and `StudentAgent` directly inside `worker.py`; process the agent’s opening turn automatically when player 0 is the agent; stop at each human prompt; validate before `Environment.step`; use `skip_turn()` for agent timeout/error results; produce normal turn/replay summaries.
- [x] **Step 4: Implement serialized session submission and authenticated endpoint**
  - Add session-level `human_action` handling under the existing lock/compute controls; stop `_batch()` at the next human prompt or terminal event; handle stop/cancel input while waiting.
- [x] **Step 5: Run backend integration and regression tests**
  - Run: `.venv\Scripts\python.exe -m pytest -q tests/backend/test_human_mode.py tests/backend/test_api.py`
  - Expected: all human cases pass and existing agent-versus-agent pair/replay/timeout tests pass.
- [x] **Step 6: Commit**
  - `feat(match): process human turns in the arena worker`

### Task 3: Add mode and side selection to the setup UI

**Files:**
- Modify: `src/main.ts`
- Modify: `src/model.ts`
- Create: `tests/e2e/human.spec.ts`
- Test: `tests/e2e/human.spec.ts`

**Interfaces:**
- Frontend mode values match the API: `agent-vs-agent` and `human-vs-agent`.
- `Player.kind` is optional and restricted to `human | agent`; `Event` includes the `human_turn` payload from Task 2.
- `HumanTurnEvent` contains `{ type: "human_turn"; round: number; state_turn: number; state: State; legal_moves: Cell[]; legal_walls: { orientation: "H" | "V"; row: number; col: number }[] }`.
- Human setup shows one agent upload and a top/bottom choice; the existing two-agent setup remains the default.

- [x] **Step 1: Write a failing browser setup test**
  - Assert default two-agent controls remain visible; selecting human mode hides the second upload and paired-round option, reveals side selection, and enables start with one valid `.py` file.
- [x] **Step 2: Run the new browser test and verify it fails on missing controls**
  - Run: `npm.cmd run test:e2e -- tests/e2e/human.spec.ts`
  - Expected: the mode and side controls are not found.
- [x] **Step 3: Implement mode-aware form rendering and creation request**
  - Send `mode`, `human_side`, and only `agent_a` in human mode; keep the existing two-upload request in agent mode. Apply `human_turn` events into frontend session state.
- [x] **Step 4: Re-run the setup browser test and existing UI tests**
  - Run: `npm.cmd run test:e2e -- tests/e2e/human.spec.ts tests/e2e/arena.spec.ts`
  - Expected: the mode form works and all existing agent-versus-agent browser flows remain unchanged.
- [x] **Step 5: Commit**
  - `feat(ui): add human match setup`

### Task 4: Make the board accept legal human actions

**Files:**
- Modify: `src/board.ts`
- Modify: `src/main.ts`
- Modify: `src/api.ts`
- Modify: `src/style.css`
- Test: `tests/frontend/model.test.ts`
- Test: `tests/e2e/human.spec.ts`

**Interfaces:**
- `BoardInteraction` contains `active`, `mode` (`move`, `horizontal`, `vertical`), `legalMoves: Cell[]`, and `legalWalls: { orientation: "H" | "V"; row: number; col: number }[]`.
- `boardSVG(state, round, last?, interaction?)` marks only legal destinations/anchors and gives clickable targets data attributes.
- UI submits the selected target as `{state_turn, action}` to `/api/sessions/{id}/action`; it disables input until the next prompt or terminal result.
- `ArenaAPI.submitHumanAction(sessionId: string, stateTurn: number, action: Record<string, unknown>): Promise<Batch>` sends that request through the existing authenticated API client.

- [x] **Step 1: Write failing board rendering tests**
  - Assert only provided legal moves and selected-orientation wall anchors receive interactive markers; inactive boards contain no actionable targets.
- [x] **Step 2: Run the focused frontend test and verify it fails**
  - Run: `npm.cmd test -- --run tests/frontend/model.test.ts`
  - Expected: `BoardInteraction` markers/attributes are absent.
- [x] **Step 3: Implement board interaction rendering and event delegation**
  - Add clickable SVG targets; add “Đi quân”, “Tường ngang”, and “Tường dọc” controls; submit actions with the prompt’s `state_turn`; show action rejection and agent status via existing notices/status text.
- [x] **Step 4: Verify frontend unit tests and focused browser actions**
  - Run: `npm.cmd test -- --run tests/frontend/model.test.ts`
  - Run: `npm.cmd run test:e2e -- tests/e2e/human.spec.ts`
  - Expected: legal targets render as specified; human move and wall actions reach the worker; clicks while inactive do not submit.
- [x] **Step 5: Commit**
  - `feat(ui): support legal human moves and walls`

### Task 5: Complete the human match, replay, and documentation flow

**Files:**
- Modify: `src/main.ts`
- Modify: `src/model.ts`
- Modify: `README.md`
- Modify: `tests/backend/test_human_mode.py`
- Modify: `tests/e2e/human.spec.ts`

**Interfaces:**
- Completed human games expose the existing summary fields and replay version 1; the human/agent `kind` values survive replay export/import.
- Human matches do not enable paired tournament scoring; normal agent-versus-agent scoring and controls are unchanged.

- [x] **Step 1: Add failing replay and end-to-end assertions**
  - Check winner/draw summary, `kind` metadata, replay download/import, both side choices, one wall placement, an agent reply, and a short game ending at the turn limit.
- [x] **Step 2: Run focused tests and verify the uncovered replay behavior**
  - Run: `.venv\Scripts\python.exe -m pytest -q tests/backend/test_human_mode.py`
  - Run: `npm.cmd run test:e2e -- tests/e2e/human.spec.ts`
  - Expected: any missing replay metadata or completion behavior fails.
- [x] **Step 3: Implement replay compatibility and user instructions**
  - Preserve replay format version 1, identify player kinds, show human/agent names in the existing result and log, and document startup and controls in Vietnamese README text.
- [x] **Step 4: Run full verification**
  - `.venv\Scripts\python.exe -m pytest -q`
  - `.venv\Scripts\python.exe -m ruff check backend tests\backend tools`
  - `.venv\Scripts\python.exe -m ruff format --check backend tests\backend tools`
  - `npm.cmd test`
  - `npm.cmd run format:check`
  - `npm.cmd run build`
  - `npm.cmd run test:e2e`
  - Expected: all commands exit successfully; the full existing agent-versus-agent suite and new human-versus-agent flow pass.
- [x] **Step 5: Review and commit**
  - Inspect `git diff --check` and the full diff; stage only feature files and tests.
  - `feat(match): finish human versus agent mode`

## Execution Notes

Run each test command in its own shell step. Keep browser tests sequential with the build/server they depend on. Do not publish the backend or modify the course engine. Push completed Conventional Commits to `main` only after the full verification passes.

