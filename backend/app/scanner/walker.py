"""Recursive repository walk. Reads file metadata and (for text files) streams content once to hash and
count lines. File contents are never kept in memory and nothing in the repository is executed."""
from __future__ import annotations

import hashlib
import os
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..config import Settings
from . import filters
from .languages import (
    MANIFEST_NAMES,
    MANIFEST_RE,
    detect_category,
    detect_language,
    extension_of,
    is_entry_point,
    is_sensitive,
)

BATCH_SIZE = 500
CHUNK = 64 * 1024


@dataclass(slots=True)
class FileRecord:
    path: str
    name: str
    directory: str
    extension: str
    language: str | None
    category: str
    size_bytes: int
    line_count: int | None
    sha256: str | None
    mtime_ns: int
    is_entry_point: bool
    is_sensitive: bool


@dataclass
class ScanOutcome:
    #: directory (repo-relative, "" = root) -> number of files directly inside it
    dir_files: dict[str, int] = field(default_factory=dict)
    manifests: list[str] = field(default_factory=list)
    names_seen: set[str] = field(default_factory=set)
    languages: Counter = field(default_factory=Counter)
    files_total: int = 0
    files_changed: int = 0
    files_unchanged: int = 0
    skipped: Counter = field(default_factory=Counter)
    errors: list[tuple[str | None, str]] = field(default_factory=list)
    truncated: bool = False

    def error(self, path: str | None, message: str) -> None:
        if len(self.errors) < 500:
            self.errors.append((path, message))


#: previous inventory: path -> (size_bytes, mtime_ns, sha256, line_count)
Previous = dict[str, tuple[int, int, str | None, int | None]]


def _is_link(entry: os.DirEntry) -> bool:
    if entry.is_symlink():
        return True
    is_junction = getattr(entry, "is_junction", None)
    return bool(is_junction and is_junction())


def _hash_and_count(path: str) -> tuple[str, int] | None:
    """(sha256, line count) of a text file, or None when it turns out to be binary."""
    digest = hashlib.sha256()
    lines = 0
    last = b""
    with open(path, "rb") as handle:
        first = handle.read(CHUNK)
        if filters.looks_binary(first[:8192]):
            return None
        chunk = first
        while chunk:
            digest.update(chunk)
            lines += chunk.count(b"\n")
            last = chunk[-1:]
            chunk = handle.read(CHUNK)
    if last and last != b"\n":
        lines += 1
    return digest.hexdigest(), lines


def scan_tree(
    root: Path,
    previous: Previous,
    settings: Settings,
    extra_excludes: tuple[str, ...],
    on_batch: Callable[[list[FileRecord]], None],
    on_progress: Callable[[ScanOutcome], None],
) -> ScanOutcome:
    outcome = ScanOutcome()
    base_specs: tuple = ()
    patterns = [*settings.extra_excludes, *extra_excludes]
    if patterns:
        base_specs = (("", filters.compile_patterns(patterns)),)

    root_str = str(root)
    visited: set[tuple[int, int]] = set()
    batch: list[FileRecord] = []
    outcome.dir_files[""] = 0
    stack: list[tuple[str, str, tuple]] = [(root_str, "", base_specs)]

    while stack:
        abs_dir, rel_dir, specs = stack.pop()
        try:
            st = os.stat(abs_dir)
            if st.st_ino:
                key = (st.st_dev, st.st_ino)
                if key in visited:
                    outcome.skipped["loop"] += 1
                    continue
                visited.add(key)
            with os.scandir(abs_dir) as it:
                entries = list(it)
        except PermissionError:
            outcome.error(rel_dir or ".", "permission denied")
            continue
        except OSError as exc:
            outcome.error(rel_dir or ".", f"cannot read directory: {exc.strerror or exc}")
            continue

        local_spec = filters.load_gitignore(Path(abs_dir), settings.max_parse_bytes)
        if local_spec is not None:
            specs = (*specs, (rel_dir + "/" if rel_dir else "", local_spec))
        sibling_names = {e.name.lower() for e in entries}

        for entry in entries:
            name = entry.name
            rel = f"{rel_dir}/{name}" if rel_dir else name
            try:
                if _is_link(entry):
                    outcome.skipped["symlink"] += 1
                    continue
                if entry.is_dir(follow_symlinks=False):
                    reason = filters.excluded_dir_reason(name, entry.path, sibling_names)
                    if reason:
                        outcome.skipped[reason] += 1
                    elif specs and filters.is_ignored(rel, True, specs):
                        outcome.skipped["gitignore"] += 1
                    else:
                        outcome.dir_files.setdefault(rel, 0)
                        stack.append((entry.path, rel, specs))
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
            except OSError as exc:
                outcome.error(rel, f"cannot inspect: {exc.strerror or exc}")
                continue

            ext = extension_of(name)
            reason = filters.excluded_file_reason(name, ext)
            if reason:
                outcome.skipped[reason] += 1
                continue
            if specs and filters.is_ignored(rel, False, specs):
                outcome.skipped["gitignore"] += 1
                continue

            try:
                stat = entry.stat(follow_symlinks=False)
            except OSError as exc:
                outcome.error(rel, f"cannot stat: {exc.strerror or exc}")
                continue
            if stat.st_size > settings.max_file_bytes:
                outcome.skipped["oversize"] += 1
                continue

            sensitive = is_sensitive(name)
            sha: str | None = None
            lines: int | None = None
            prior = previous.get(rel)
            if sensitive:  # listed, but the content is never opened
                if prior and prior[:2] == (stat.st_size, stat.st_mtime_ns):
                    outcome.files_unchanged += 1
                else:
                    outcome.files_changed += 1
            elif prior and prior[0] == stat.st_size and prior[1] == stat.st_mtime_ns and prior[2]:
                sha, lines = prior[2], prior[3]
                outcome.files_unchanged += 1
            else:
                try:
                    result = _hash_and_count(entry.path)
                except PermissionError:
                    outcome.error(rel, "permission denied")
                    continue
                except OSError as exc:
                    outcome.error(rel, f"cannot read: {exc.strerror or exc}")
                    continue
                if result is None:
                    outcome.skipped["binary"] += 1
                    continue
                sha, lines = result
                if prior and prior[2] == sha:
                    outcome.files_unchanged += 1  # touched but identical
                else:
                    outcome.files_changed += 1

            language = detect_language(name, ext)
            batch.append(
                FileRecord(
                    path=rel,
                    name=name,
                    directory=rel_dir,
                    extension=ext,
                    language=language,
                    category=detect_category(rel, name, ext, language),
                    size_bytes=stat.st_size,
                    line_count=lines,
                    sha256=sha,
                    mtime_ns=stat.st_mtime_ns,
                    is_entry_point=is_entry_point(rel, name),
                    is_sensitive=sensitive,
                )
            )
            outcome.files_total += 1
            outcome.dir_files[rel_dir] += 1
            outcome.names_seen.add(name.lower())
            if language:
                outcome.languages[language] += 1
            if name.lower() in MANIFEST_NAMES or MANIFEST_RE.search(name):
                outcome.manifests.append(rel)

            if len(batch) >= BATCH_SIZE:
                on_batch(batch)
                batch = []
                on_progress(outcome)
            if outcome.files_total >= settings.max_files_per_scan:
                outcome.truncated = True
                outcome.error(None, f"stopped after {settings.max_files_per_scan} files (limit reached)")
                stack.clear()
                break

    if batch:
        on_batch(batch)
    on_progress(outcome)
    return outcome
