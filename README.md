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

The original course engine must be available beside this repository at `../wrongway` and contain `arena.py`, `environment.py`, `agent_runner.py`, and `visualizer.py`. The Arena imports it unchanged for agent process limits and match orchestration, while applying its own board rules in the isolated worker. If the engine is elsewhere, set `WRONGWAY_REFERENCE` to its folder before starting the server:

```powershell
$env:WRONGWAY_REFERENCE = 'D:\path\to\wrongway'
py -3.12 tools/run.py
```

## Play and inspect matches

The Arena's rule variant keeps the 9-column game area and adds a finish row past each opponent edge, for 11 rows total. Row coordinates in actions and observations run from 0 through 10; `row_offset: -1` labels those rows as -1 through 9 on the board. The original 9×9 area is rows 1 through 9 internally, labeled 0 through 8. Reaching row 0 or 10 wins. Observations include `board_rows`, `board_cols`, and `row_offset`; new agents should read these fields instead of assuming a square 9×9 board. The current `25127400.py` agent uses fixed 9×9 indexing and needs to be adapted before it can play this Arena variant. The original course engine remains unchanged, and the official course rules are still whatever the instructor distributes.

Choose two `.py` files, set the seed and turn limit, and start a match. A paired series defaults to two games and swaps player order for the second game. The Arena assigns 3 points for a win, 1 for a draw, and 0 for a loss, following agent identity across the swap. You can pause between turns, step through the game, seek on the timeline, change rounds, and download a replay. A downloaded replay can be opened later without a running backend.

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

The backend tests cover API validation, deadlines, cancellation, paired rounds, replay output, and both finish lines. Frontend tests cover score identity and replay validation. Browser tests exercise uploads, beyond-line wins, pause and resume, replay download and reload, and the mobile layout. CI skips course-engine integration checks when instructor engine files are unavailable.

## Design and included files

The interface takes visual cues from [TypeUI Sketch](https://www.typeui.sh/design-skills/sketch): warm paper tones, hand-drawn headings, dashed card edges, and teal controls. The bundled Patrick Hand and Be Vietnam Pro fonts include their license texts in `public/licenses/`. `public/examples/` contains small example agents written for this Arena.
