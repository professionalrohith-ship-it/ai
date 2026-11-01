"""Stack trace parsing: frames mentioned in an error text, mapped to real inventory files."""
from __future__ import annotations

import re
from dataclasses import dataclass

_PY = re.compile(r'File "([^"]+)", line (\d+)(?:, in ([\w<>.$]+))?')
_JS = re.compile(r"^\s*at\s+(?:([^\s(]+)\s+\()?(.+?):(\d+)(?::\d+)?\)?\s*$", re.M)
_JAVA = re.compile(r"\bat\s+([\w.$<>]+)\(([\w$-]+\.(?:java|kt|scala)):(\d+)\)")
_GENERIC = re.compile(r"([\w.\\/-]+\.(?:py|js|jsx|ts|tsx|mjs|java|c|cc|cpp|h|hpp|cs|go|rs|php|rb)):(\d+)(?::\d+)?")
_CSHARP = re.compile(r"\bin\s+(.+?\.cs):line\s+(\d+)")


@dataclass
class Frame:
    path: str  # as written in the trace
    line: int
    function: str | None = None


def parse_frames(text: str) -> list[Frame]:
    """Frames in order of appearance, innermost first (Python tracebacks list the innermost frame last, so they
    are reversed). Duplicates are removed."""
    frames: list[Frame] = []

    def add(path: str, line: str, function: str | None) -> None:
        frame = Frame(path.strip().strip("'\""), int(line), function)
        if all((f.path, f.line) != (frame.path, frame.line) for f in frames):
            frames.append(frame)

    python = [Frame(m.group(1), int(m.group(2)), m.group(3)) for m in _PY.finditer(text)]
    if python:
        for frame in reversed(python):
            add(frame.path, str(frame.line), frame.function)
    for m in _JAVA.finditer(text):
        add(m.group(2), m.group(3), m.group(1))
    for m in _JS.finditer(text):
        path = m.group(2)
        if re.search(r"\.\w{1,5}$", path.split("?")[0]) and not path.startswith("node:") and "(" not in path and ")" not in path:
            add(path.replace("file:///", ""), m.group(3), m.group(1))
    for m in _CSHARP.finditer(text):
        add(m.group(1), m.group(2), None)
    for m in _GENERIC.finditer(text):
        add(m.group(1), m.group(2), None)
    return frames


def map_to_inventory(frame_path: str, inventory: set[str]) -> tuple[str | None, bool]:
    """(inventory path, ambiguous). Longest path-suffix match; a bare basename must be unique."""
    segments = [s for s in re.split(r"[\\/]+", frame_path.replace("file:///", "")) if s and s != "." and not s.endswith(":")]
    for start in range(len(segments)):
        suffix = "/".join(segments[start:])
        matches = sorted(p for p in inventory if p == suffix or p.endswith("/" + suffix))
        if len(matches) == 1:
            return matches[0], False
        if len(matches) > 1:
            return None, True
    return None, False
