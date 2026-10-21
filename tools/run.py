"""Serve both frontend and Python API on loopback, using this project's venv."""

import argparse
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port from 1024 to 65535")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file() or not (ROOT / "dist/index.html").is_file():
        raise SystemExit("Run py -3.12 tools/setup.py first.")
    reference = Path(os.environ.get("WRONGWAY_REFERENCE", ROOT.parent / "wrongway"))
    if not all(
        (reference / name).is_file()
        for name in ("arena.py", "environment.py", "agent_runner.py", "visualizer.py")
    ):
        raise SystemExit("Set WRONGWAY_REFERENCE to the original course Arena folder.")
    os.environ["ARENA_ORIGINS"] = ",".join(
        filter(
            None,
            [
                os.environ.get("ARENA_ORIGINS", ""),
                f"http://127.0.0.1:{args.port}",
                f"http://localhost:{args.port}",
            ],
        )
    )
    print(f"Wrongway Arena: http://127.0.0.1:{args.port}\nPress Ctrl+C to stop.", flush=True)
    try:
        subprocess.run(
            [
                str(python),
                "-m",
                "uvicorn",
                "backend.app:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.port),
            ],
            cwd=ROOT,
            check=True,
        )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
