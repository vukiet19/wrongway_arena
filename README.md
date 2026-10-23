# Wrongway Arena

Wrongway Arena lets you upload two Python agents, run them through the original course game engine, watch each turn, and save or replay a match. The web page can be hosted as a static GitHub Pages site; the Python backend and game engine run on your own computer.

## Run it on Windows

Install Python 3.12 and Node.js 24, then open PowerShell in this folder and run setup once:

```powershell
py -3.12 tools/setup.py
```

Start the Arena:

```powershell
py -3.12 tools/run.py
```

Or double-click `start.cmd`. Open <http://127.0.0.1:8000>. Keep the terminal open while playing; press Ctrl+C there to stop the server. Setup creates `.venv`, installs the locked dependencies, and builds the static page. It does not change the course project.

The original course engine must be available beside this repository at `../wrongway` and contain `arena.py`, `environment.py`, `agent_runner.py`, and `visualizer.py`. The Arena imports and runs it unchanged for board rules, agent process limits, and match orchestration. The board is 9×9; each player wins by reaching the opposite edge row (row 0 or row 8). If the engine is elsewhere, set `WRONGWAY_REFERENCE` to its folder before starting the server:

```powershell
$env:WRONGWAY_REFERENCE = 'D:\path\to\wrongway'
py -3.12 tools/run.py
```

## Play and inspect matches

The board has 9 rows and 9 columns. The first row (0) and last row (8) are goal rows, highlighted on the board; a player wins as soon as their pawn reaches the opposite goal row. Observations and actions follow the original course engine format, so agents written for the course rules can play directly.

Choose two `.py` files, set the seed and turn limit, and start a match. A paired series defaults to two games and swaps player order for the second game. The Arena assigns 3 points for a win, 1 for a draw, and 0 for a loss, following agent identity across the swap. You can pause between turns, step through the game, seek on the timeline, change rounds, and download a replay. A downloaded replay can be opened later without a running backend.

To play yourself, change **Chế độ thi đấu** to **Bạn đấu agent**, upload one `.py` file, then choose whether you start at the bottom or top. The Arena runs one game without paired-series scoring. On your turn, choose **Đi quân**, **Tường ngang**, or **Tường dọc**, then click one of the engine-highlighted legal targets. Your turn has no agent timer; the uploaded agent keeps the normal five-second startup and one-second action limits. The result and replay identify which player was human or agent.

The runner applies a 5-second agent startup deadline and a 1-second deadline per action. A timed-out, invalid, or crashed agent is recorded in the match journal. The backend uses separate Python processes and keeps uploaded agents and match files under the ignored `.local/` directory.

This local mode isolates crashes and enforces time limits, but it is not an operating-system security sandbox. Run only Python agents you trust on your computer. The Arena does not upload agents to GitHub or copy instructor files into this repository.

## GitHub Pages

The `pages.yml` workflow builds and deploys the static frontend from `main`. The backend is not deployed there: a Pages site needs the local backend running to start or control a match. A hosted frontend can connect to a local Arena after its origin is added to `ARENA_ORIGINS` and the backend is restarted. The local page at port 8000 is configured by default.

## Development checks

```powershell
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe -m ruff check backend tests/backend tools
npm.cmd test
npm.cmd run format:check
npm.cmd run build
npm.cmd run test:e2e
```

The backend tests cover API validation, deadlines, cancellation, paired rounds, replay output, and both goal rows. Frontend tests cover score identity, replay validation, and goal-row rendering. Browser tests exercise uploads, goal-row wins, pause and resume, replay download and reload, and the mobile layout. CI skips course-engine integration checks when instructor engine files are unavailable.

## Design and included files

The interface takes visual cues from [TypeUI Sketch](https://www.typeui.sh/design-skills/sketch): warm paper tones, hand-drawn headings, dashed card edges, and teal controls. The bundled Patrick Hand and Be Vietnam Pro fonts include their license texts in `public/licenses/`. `public/examples/` contains small example agents written for this Arena.
