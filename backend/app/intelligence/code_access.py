"""Return a numbered line range from a repository file. The path must be in the scan inventory and
non-sensitive, must stay inside the repository, and symlinks are refused. Content is only returned, never run."""
from __future__ import annotations

import hashlib
import os
import stat

from ..db import Database
from ..errors import ApiError

MAX_RANGE_LINES = 500


def read_section(db: Database, repo_id: str, repo_path: str, rel: str, start: int, end: int, max_bytes: int) -> dict:
    if start < 1 or end < start:
        raise ApiError(422, "invalid_range", "start must be >= 1 and end >= start.")
    if end - start + 1 > MAX_RANGE_LINES:
        raise ApiError(422, "range_too_large", f"At most {MAX_RANGE_LINES} lines can be requested at once.")
    with db.session() as conn:
        row = conn.execute(
            "SELECT is_sensitive, sha256 FROM files WHERE repository_id=? AND path=?", (repo_id, rel)
        ).fetchone()
    if row is None:
        raise ApiError(404, "file_not_in_inventory", "File not found in the scanned repository inventory.")
    if row["is_sensitive"]:
        raise ApiError(403, "sensitive_file", "This file is marked sensitive and its content is never returned.")

    root_real = os.path.realpath(repo_path)
    full = os.path.join(root_real, *rel.split("/"))
    try:
        info = os.lstat(full)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            raise ApiError(403, "not_a_regular_file", "Only regular files can be read.")
        if info.st_size > max_bytes:
            raise ApiError(413, "file_too_large", "File is too large to display.")
        if os.path.commonpath([root_real, os.path.realpath(full)]) != root_real:
            raise ApiError(403, "outside_repository", "Path resolves outside the repository.")
        digest = hashlib.sha256()
        lines: list[dict] = []
        total = 0
        with open(full, "rb") as handle:
            for raw in handle:  # streaming: the whole file is never held in memory
                total += 1
                digest.update(raw)
                if start <= total <= end:
                    lines.append({"number": total, "text": raw.decode("utf-8", "replace").rstrip("\r\n")})
    except FileNotFoundError:
        raise ApiError(404, "file_missing", "The file no longer exists on disk (rescan the repository).") from None
    except PermissionError:
        raise ApiError(403, "permission_denied", "Permission denied while reading the file.") from None
    except OSError:
        raise ApiError(422, "unreadable", "The file could not be read.") from None
    if start > total:
        raise ApiError(422, "range_out_of_bounds", f"The file has only {total} lines.")
    return {
        "path": rel,
        "start_line": start,
        "end_line": lines[-1]["number"] if lines else start,
        "total_lines": total,
        "lines": lines,
        # content changed since the last scan: line numbers in the index may no longer match
        "stale": row["sha256"] is not None and digest.hexdigest() != row["sha256"],
    }
