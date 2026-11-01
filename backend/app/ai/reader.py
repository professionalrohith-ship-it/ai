"""Safe, bounded access to repository files for retrieval. Only inventory files that are not sensitive, are regular
files (no symlinks) and stay inside the repository are ever opened. Content is only read, never executed."""
from __future__ import annotations

import os
import stat

from ..db import Database

GREP_MAX_FILES = 3000
GREP_MAX_BYTES = 512 * 1024


class RepoReader:
    def __init__(self, db: Database, repo_id: str, repo_path: str, max_file_bytes: int):
        self.db = db
        self.repo_id = repo_id
        self.root_real = os.path.realpath(repo_path)
        self.max_file_bytes = max_file_bytes
        self._inventory: dict[str, tuple[bool, int]] | None = None

    # ---- inventory ---------------------------------------------------------------------
    def inventory(self) -> dict[str, tuple[bool, int]]:
        """path -> (is_sensitive, size_bytes) for every inventory file."""
        if self._inventory is None:
            with self.db.session() as conn:
                self._inventory = {
                    r[0]: (bool(r[1]), r[2])
                    for r in conn.execute(
                        "SELECT path, is_sensitive, size_bytes FROM files WHERE repository_id=?", (self.repo_id,)
                    )
                }
        return self._inventory

    def paths(self) -> set[str]:
        return set(self.inventory())

    def readable(self, rel: str) -> bool:
        entry = self.inventory().get(rel)
        return entry is not None and not entry[0]

    # ---- reading -----------------------------------------------------------------------
    def _open_checked(self, rel: str):
        if not self.readable(rel):
            return None
        full = os.path.join(self.root_real, *rel.split("/"))
        try:
            info = os.lstat(full)
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_size > self.max_file_bytes:
                return None
            if os.path.commonpath([self.root_real, os.path.realpath(full)]) != self.root_real:
                return None
            return open(full, "rb")
        except (OSError, ValueError):
            return None

    def read_lines(self, rel: str, start: int, end: int) -> list[tuple[int, str]]:
        """Numbered lines start..end (1-based, inclusive). Empty list when the file cannot be read safely."""
        handle = self._open_checked(rel)
        if handle is None:
            return []
        out: list[tuple[int, str]] = []
        try:
            with handle:
                head = handle.read(8192)
                if b"\0" in head:
                    return []
                handle.seek(0)
                for number, raw in enumerate(handle, 1):
                    if number > end:
                        break
                    if number >= start:
                        out.append((number, raw.decode("utf-8", "replace").rstrip("\r\n")))
        except OSError:
            return []
        return out

    def snippet(self, rel: str, start: int, end: int) -> tuple[str, int, int] | None:
        """(text, first line, last line) with real line numbers prefixed, or None."""
        lines = self.read_lines(rel, max(1, start), max(start, end))
        if not lines:
            return None
        width = len(str(lines[-1][0]))
        text = "\n".join(f"{n:>{width}} | {t}" for n, t in lines)
        return text, lines[0][0], lines[-1][0]

    def read_text(self, rel: str, limit: int = 1024 * 1024) -> str | None:
        """Whole small text file (manifests, README). None if unreadable or too large."""
        handle = self._open_checked(rel)
        if handle is None:
            return None
        try:
            with handle:
                data = handle.read(limit + 1)
        except OSError:
            return None
        if len(data) > limit or b"\0" in data[:8192]:
            return None
        return data.decode("utf-8", "replace")

    # ---- bounded grep ------------------------------------------------------------------
    def grep(self, terms: list[str], max_hits: int = 40, ignore_case: bool = True,
             categories: tuple[str, ...] = ("source", "test", "config", "manifest")) -> list[tuple[str, int, str, str]]:
        """Lines containing any term: (path, line, text, matched term). At most GREP_MAX_FILES files of
        GREP_MAX_BYTES each are scanned and the search stops after max_hits lines."""
        terms = [t for t in terms if t and len(t) >= 3]
        if not terms:
            return []
        needles = [t.lower() for t in terms] if ignore_case else terms
        with self.db.session() as conn:
            rows = conn.execute(
                f"SELECT path FROM files WHERE repository_id=? AND is_sensitive=0 AND size_bytes<=?"
                f" AND category IN ({','.join('?' * len(categories))}) ORDER BY (category='source') DESC, path LIMIT ?",
                (self.repo_id, GREP_MAX_BYTES, *categories, GREP_MAX_FILES),
            ).fetchall()
        hits: list[tuple[str, int, str, str]] = []
        for row in rows:
            rel = row[0]
            handle = self._open_checked(rel)
            if handle is None:
                continue
            try:
                with handle:
                    data = handle.read(GREP_MAX_BYTES)
            except OSError:
                continue
            if b"\0" in data[:8192]:
                continue
            text = data.decode("utf-8", "replace")
            haystack = text.lower() if ignore_case else text
            if not any(n in haystack for n in needles):
                continue
            per_file = 0
            for number, line in enumerate(text.splitlines(), 1):
                hay = line.lower() if ignore_case else line
                matched = next((t for t, n in zip(terms, needles) if n in hay), None)
                if matched:
                    hits.append((rel, number, line.strip()[:240], matched))
                    per_file += 1
                    if len(hits) >= max_hits:
                        return hits
                    if per_file >= 3:
                        break
        return hits
