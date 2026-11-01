"""Branch/commit read straight from .git files. The git binary is never run: repository config
(hooks, fsmonitor, ssh commands) must not get a chance to execute. Only a .git directory inside the
repository is read, so a hostile `.git` file cannot point the scanner outside it."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

HEX = re.compile(r"^[0-9a-f]{40}([0-9a-f]{24})?$")
REF = re.compile(r"^refs/[A-Za-z0-9._/\-]+$")
MAX_READ = 64 * 1024


@dataclass
class GitInfo:
    is_git: bool = False
    branch: str | None = None
    commit: str | None = None


def _read(path: Path) -> str | None:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_READ:
            return None
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None


def read_git_info(root: Path) -> GitInfo:
    dot_git = root / ".git"
    if not dot_git.exists():
        return GitInfo()
    if dot_git.is_symlink() or not dot_git.is_dir():
        return GitInfo(is_git=True)  # worktree/submodule pointer file: not followed

    head = _read(dot_git / "HEAD")
    if not head:
        return GitInfo(is_git=True)
    if head.startswith("ref: "):
        ref = head[5:].strip()
        if not REF.match(ref) or ".." in ref:
            return GitInfo(is_git=True)
        branch = ref[len("refs/heads/"):] if ref.startswith("refs/heads/") else ref
        commit = _read(dot_git / ref)
        if commit is None:
            commit = _from_packed_refs(dot_git / "packed-refs", ref)
        return GitInfo(True, branch, commit if commit and HEX.match(commit) else None)
    return GitInfo(True, None, head if HEX.match(head) else None)  # detached HEAD


def _from_packed_refs(packed: Path, ref: str) -> str | None:
    text = _read(packed)
    if not text:
        return None
    for line in text.splitlines():
        if line and line[0] not in "#^" and line.endswith(" " + ref):
            return line.split(" ", 1)[0]
    return None
