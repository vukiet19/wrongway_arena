"""Prepare Python tooling and the static frontend without changing the course files."""

import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)


def main():
    if sys.version_info < (3, 12):
        raise SystemExit("Use py -3.12 tools/setup.py")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        venv.EnvBuilder(with_pip=True).create(ROOT / ".venv")
    run(python, "-m", "pip", "--disable-pip-version-check", "install", "-r", "requirements-dev.txt")
    run(python, "-m", "pip", "check")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("Install Node.js 22.12+ or 24+, then run setup again.")
    run(npm, "ci")
    run(npm, "run", "build")
    print("Ready. Start the local Arena with: py -3.12 tools/run.py")


if __name__ == "__main__":
    main()
