"""Lock the installed development environment and the runtime dependency closure."""

import subprocess
import sys
from importlib.metadata import distribution
from pathlib import Path

from packaging.requirements import Requirement

ROOT = Path(__file__).resolve().parents[1]


def main():
    queue = [
        Requirement(line).name
        for line in (ROOT / "requirements.in").read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    installed = {}
    while queue:
        dist = distribution(queue.pop())
        name = dist.metadata["Name"].lower().replace("_", "-")
        if name in installed:
            continue
        installed[name] = dist.version
        for dependency in dist.requires or []:
            requirement = Requirement(dependency)
            if requirement.marker is None or requirement.marker.evaluate({"extra": ""}):
                queue.append(requirement.name)
    runtime = "".join(f"{name}=={version}\n" for name, version in sorted(installed.items()))
    development = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
    (ROOT / "requirements.txt").write_text(runtime, encoding="utf-8", newline="\n")
    (ROOT / "requirements-dev.txt").write_text(development, encoding="utf-8", newline="\n")
    print("Updated requirements.txt and requirements-dev.txt from this environment.")


if __name__ == "__main__":
    main()
