"""Repository registration and persistence of repository records."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .db import Database
from .errors import ApiError
from .scanner.gitinfo import read_git_info


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class ValidatedPath:
    resolved: Path
    key: str  # case/separator-normalised form used for duplicate detection


def validate_path(raw: str) -> ValidatedPath:
    """Resolve a user-supplied path to a readable directory or raise ApiError."""
    text = (raw or "").strip().strip('"').strip("'")
    if not text:
        raise ApiError(422, "invalid_path", "Enter a repository path.")
    if "\0" in text or any(ord(c) < 32 for c in text):
        raise ApiError(422, "invalid_path", "The path contains invalid characters.")
    if text.startswith("\\\\?\\"):
        text = text[4:]
    candidate = Path(text)
    if not candidate.is_absolute():
        raise ApiError(422, "invalid_path", "Use an absolute path, for example C:\\Projects\\my-app.")
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        raise ApiError(404, "path_not_found", "That folder does not exist.") from None
    except PermissionError:
        raise ApiError(403, "permission_denied", "Permission denied while accessing that path.") from None
    except (OSError, RuntimeError, ValueError):
        raise ApiError(422, "invalid_path", "That path is not valid.") from None
    resolved_text = str(resolved)
    if resolved_text.startswith("\\\\?\\") and not resolved_text.startswith("\\\\?\\UNC"):
        resolved = Path(resolved_text[4:])
    if not resolved.is_dir():
        raise ApiError(422, "not_a_directory", "That path is a file, not a folder.")
    if resolved.parent == resolved:
        raise ApiError(422, "path_too_broad", "Choose a project folder, not a drive root.")
    try:
        with os.scandir(resolved) as probe:
            next(probe, None)
    except PermissionError:
        raise ApiError(403, "permission_denied", "Permission denied: the folder cannot be read.") from None
    except OSError:
        raise ApiError(422, "invalid_path", "The folder cannot be read.") from None
    return ValidatedPath(resolved, os.path.normcase(os.path.normpath(str(resolved))))


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "repository"


@dataclass(frozen=True)
class RepositoryRow:
    id: str
    name: str
    path: str
    description: str | None
    is_git: bool
    branch: str | None
    commit: str | None
    status: str
    added_at: str
    last_scanned_at: str | None
    file_count: int
    folder_count: int
    main_language: str | None
    languages: list[str]
    frameworks: list[str]
    last_error: str | None

    @staticmethod
    def from_row(row: sqlite3.Row) -> "RepositoryRow":
        return RepositoryRow(
            id=row["id"], name=row["name"], path=row["path"], description=row["description"],
            is_git=bool(row["is_git"]), branch=row["branch"], commit=row["commit_hash"],
            status=row["status"], added_at=row["added_at"], last_scanned_at=row["last_scanned_at"],
            file_count=row["file_count"], folder_count=row["folder_count"],
            main_language=row["main_language"], languages=json.loads(row["languages_json"]),
            frameworks=json.loads(row["frameworks_json"]), last_error=row["last_error"],
        )


class RepositoryService:
    def __init__(self, db: Database):
        self.db = db

    def register(self, raw_path: str, name: str | None, description: str | None) -> RepositoryRow:
        valid = validate_path(raw_path)
        git = read_git_info(valid.resolved)
        display = (name or "").strip() or valid.resolved.name or "repository"
        repo_id = f"repo-{_slug(display)}-{uuid.uuid4().hex[:8]}"
        try:
            with self.db.tx() as conn:
                conn.execute(
                    "INSERT INTO repositories (id, name, path, path_key, description, is_git, branch, commit_hash, added_at)"
                    " VALUES (?,?,?,?,?,?,?,?,?)",
                    (repo_id, display[:120], str(valid.resolved), valid.key, (description or "").strip() or None,
                     int(git.is_git), git.branch, git.commit, utcnow()),
                )
        except sqlite3.IntegrityError:
            raise ApiError(409, "duplicate_repository", "This folder is already registered.") from None
        return self.get(repo_id)

    def get(self, repo_id: str) -> RepositoryRow:
        with self.db.session() as conn:
            row = conn.execute("SELECT * FROM repositories WHERE id=?", (repo_id,)).fetchone()
        if row is None:
            raise ApiError(404, "repository_not_found", "Repository not found.")
        return RepositoryRow.from_row(row)

    def list(self) -> list[RepositoryRow]:
        with self.db.session() as conn:
            rows = conn.execute("SELECT * FROM repositories ORDER BY name COLLATE NOCASE, added_at").fetchall()
        return [RepositoryRow.from_row(r) for r in rows]

    def delete(self, repo_id: str) -> None:
        with self.db.tx() as conn:
            running = conn.execute(
                "SELECT 1 FROM scans WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)
            ).fetchone()
            if running:
                raise ApiError(409, "scan_running", "Wait for the running scan to finish before removing this repository.")
            if conn.execute(
                "SELECT 1 FROM parse_runs WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)
            ).fetchone():
                raise ApiError(409, "parse_running", "Wait for the running parse to finish before removing this repository.")
            deleted = conn.execute("DELETE FROM repositories WHERE id=?", (repo_id,)).rowcount
        if not deleted:
            raise ApiError(404, "repository_not_found", "Repository not found.")
