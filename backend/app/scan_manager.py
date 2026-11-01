"""Background scan execution. Scans run on a small thread pool so API requests never block on disk work."""
from __future__ import annotations

import json
import posixpath
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

from .config import Settings
from .db import Database
from .errors import ApiError
from .repo_service import RepositoryRow, RepositoryService, utcnow, validate_path
from .scanner import frameworks
from .scanner.gitinfo import read_git_info
from .scanner.walker import FileRecord, Previous, ScanOutcome, scan_tree

STAGES = ["initialise", "discover", "languages", "frameworks", "config", "inventory", "complete"]
FRAMEWORK_CATEGORIES = ("frontend-framework", "backend-framework", "database")

UPSERT_FILE = """
INSERT INTO files (repository_id, path, name, directory, extension, language, category, size_bytes,
                   line_count, sha256, mtime_ns, is_entry_point, is_sensitive, last_scan_id)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(repository_id, path) DO UPDATE SET
  name=excluded.name, directory=excluded.directory, extension=excluded.extension,
  language=excluded.language, category=excluded.category, size_bytes=excluded.size_bytes,
  line_count=excluded.line_count, sha256=excluded.sha256, mtime_ns=excluded.mtime_ns,
  is_entry_point=excluded.is_entry_point, is_sensitive=excluded.is_sensitive,
  last_scan_id=excluded.last_scan_id
"""


class ScanManager:
    def __init__(self, settings: Settings, db: Database, repos: RepositoryService):
        self.settings = settings
        self.db = db
        self.repos = repos
        self.pool = ThreadPoolExecutor(max_workers=settings.scan_workers, thread_name_prefix="scan")
        self.futures: dict[str, Future] = {}

    # ---- lifecycle -------------------------------------------------------------------------
    def recover_interrupted(self) -> None:
        """A server restart kills running scans; make sure nothing is left showing as 'running'."""
        with self.db.tx() as conn:
            conn.execute(
                "UPDATE scans SET status='failed', finished_at=?, error='Interrupted by a server restart'"
                " WHERE status IN ('queued','running')", (utcnow(),)
            )
            conn.execute(
                "UPDATE repositories SET status=CASE WHEN last_scanned_at IS NULL THEN 'error' ELSE 'indexed' END,"
                " last_error='Scan interrupted by a server restart' WHERE status='indexing'"
            )

    def shutdown(self) -> None:
        self.pool.shutdown(wait=False, cancel_futures=True)

    def wait(self, scan_id: str, timeout: float = 30) -> None:
        future = self.futures.get(scan_id)
        if future:
            future.result(timeout=timeout)

    # ---- start -----------------------------------------------------------------------------
    def start(self, repo_id: str, extra_excludes: tuple[str, ...] = ()) -> str:
        repo = self.repos.get(repo_id)
        scan_id = f"scan-{uuid.uuid4().hex[:12]}"
        with self.db.tx() as conn:
            if conn.execute(
                "SELECT 1 FROM scans WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)
            ).fetchone():
                raise ApiError(409, "scan_running", "A scan is already running for this repository.")
            if conn.execute(
                "SELECT 1 FROM parse_runs WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)
            ).fetchone():
                raise ApiError(409, "parse_running", "Wait for the running code parse to finish before scanning.")
            conn.execute(
                "INSERT INTO scans (id, repository_id, status, started_at) VALUES (?,?, 'queued', ?)",
                (scan_id, repo_id, utcnow()),
            )
            conn.execute("UPDATE repositories SET status='indexing', last_error=NULL WHERE id=?", (repo_id,))
        self.futures[scan_id] = self.pool.submit(self._run, scan_id, repo, extra_excludes)
        return scan_id

    # ---- the scan itself -------------------------------------------------------------------
    def _run(self, scan_id: str, repo: RepositoryRow, extra_excludes: tuple[str, ...]) -> None:
        started = time.monotonic()
        try:
            self._execute(scan_id, repo, extra_excludes, started)
        except Exception as exc:  # noqa: BLE001 - any failure must end up recorded, not lost in the pool
            message = f"{type(exc).__name__}: {exc}"[:500]
            with self.db.tx() as conn:
                conn.execute(
                    "UPDATE scans SET status='failed', finished_at=?, error=? WHERE id=?",
                    (utcnow(), message, scan_id),
                )
                conn.execute(
                    "UPDATE repositories SET status=CASE WHEN last_scanned_at IS NULL THEN 'error' ELSE 'indexed' END,"
                    " last_error=? WHERE id=?", (message, repo.id),
                )

    def _update(self, scan_id: str, stage: str, progress: int, outcome: ScanOutcome | None = None) -> None:
        sets, args = ["status='running'", "stage=?", "progress=?"], [stage, progress]
        if outcome is not None:
            sets += ["files_discovered=?", "folders_discovered=?", "languages_json=?"]
            args += [
                outcome.files_total, len(outcome.dir_files),
                json.dumps([name for name, _ in outcome.languages.most_common(12)]),
            ]
        with self.db.tx() as conn:
            conn.execute(f"UPDATE scans SET {', '.join(sets)} WHERE id=?", (*args, scan_id))

    def _execute(self, scan_id: str, repo: RepositoryRow, extra_excludes: tuple[str, ...], started: float) -> None:
        self._update(scan_id, "initialise", 1)
        valid = validate_path(repo.path)  # folder may have moved or lost permissions since registration
        root = valid.resolved
        git = read_git_info(root)

        with self.db.session() as conn:
            previous: Previous = {
                r["path"]: (r["size_bytes"], r["mtime_ns"], r["sha256"], r["line_count"])
                for r in conn.execute(
                    "SELECT path, size_bytes, mtime_ns, sha256, line_count FROM files WHERE repository_id=?", (repo.id,)
                )
            }
        expected = max(len(previous), repo.file_count, 0)

        def on_batch(batch: list[FileRecord]) -> None:
            with self.db.tx() as conn:
                conn.executemany(
                    UPSERT_FILE,
                    [
                        (repo.id, f.path, f.name, f.directory, f.extension, f.language, f.category, f.size_bytes,
                         f.line_count, f.sha256, f.mtime_ns, int(f.is_entry_point), int(f.is_sensitive), scan_id)
                        for f in batch
                    ],
                )

        def on_progress(outcome: ScanOutcome) -> None:
            n = outcome.files_total
            ratio = min(n / expected, 1.0) if expected else 1 - 1 / (1 + n / 1500)
            self._update(scan_id, "discover", 3 + int(ratio * 80), outcome)

        self._update(scan_id, "discover", 3)
        outcome = scan_tree(root, previous, self.settings, extra_excludes, on_batch, on_progress)

        self._update(scan_id, "languages", 86, outcome)
        with self.db.session() as conn:
            lang_rows = conn.execute(
                "SELECT language, COUNT(*) AS files, SUM(size_bytes) AS bytes FROM files"
                " WHERE repository_id=? AND language IS NOT NULL AND category!='doc' GROUP BY language"
                " ORDER BY bytes DESC", (repo.id,)
            ).fetchall()

        self._update(scan_id, "frameworks", 90, outcome)
        techs, extra_entries = frameworks.detect(root, outcome, self.settings)
        framework_names = [t.name for t in techs if t.category in FRAMEWORK_CATEGORIES]

        self._update(scan_id, "config", 94, outcome)
        language_techs = [
            (row["language"], "language", "file inventory", "high") for row in lang_rows
        ]

        self._update(scan_id, "inventory", 97, outcome)
        finished = utcnow()
        languages = [r["language"] for r in lang_rows]
        summary = {
            "skipped": dict(outcome.skipped),
            "truncated": outcome.truncated,
            "durationSeconds": round(time.monotonic() - started, 2),
        }
        with self.db.tx() as conn:
            conn.execute("DELETE FROM files WHERE repository_id=? AND last_scan_id!=?", (repo.id, scan_id))
            for entry in extra_entries:
                normalised = posixpath.normpath(entry.replace("\\", "/"))
                if not normalised.startswith(("..", "/")):
                    conn.execute(
                        "UPDATE files SET is_entry_point=1 WHERE repository_id=? AND path=?", (repo.id, normalised)
                    )
            conn.execute("DELETE FROM directories WHERE repository_id=?", (repo.id,))
            conn.executemany(
                "INSERT INTO directories (repository_id, path, file_count) VALUES (?,?,?)",
                _recursive_counts(repo.id, outcome.dir_files),
            )
            conn.execute("DELETE FROM technologies WHERE repository_id=?", (repo.id,))
            conn.executemany(
                "INSERT OR IGNORE INTO technologies (repository_id, name, category, version, source, confidence)"
                " VALUES (?,?,?,?,?,?)",
                [(repo.id, n, c, None, s, conf) for n, c, s, conf in language_techs]
                + [(repo.id, t.name, t.category, t.version, t.source, t.confidence) for t in techs],
            )
            conn.executemany(
                "INSERT INTO scan_errors (scan_id, path, message) VALUES (?,?,?)",
                [(scan_id, p, m) for p, m in outcome.errors],
            )
            conn.execute(
                "UPDATE scans SET status='completed', stage='complete', progress=100, finished_at=?,"
                " files_discovered=?, folders_discovered=?, files_changed=?, files_unchanged=?,"
                " languages_json=?, frameworks_json=?, summary_json=? WHERE id=?",
                (finished, outcome.files_total, len(outcome.dir_files), outcome.files_changed,
                 outcome.files_unchanged, json.dumps(languages[:12]), json.dumps(framework_names),
                 json.dumps(summary), scan_id),
            )
            conn.execute(
                "UPDATE repositories SET status='indexed', last_scanned_at=?, file_count=?, folder_count=?,"
                " main_language=?, languages_json=?, frameworks_json=?, is_git=?, branch=?, commit_hash=?,"
                " last_error=NULL WHERE id=?",
                (finished, outcome.files_total, len(outcome.dir_files), languages[0] if languages else None,
                 json.dumps(languages[:8]), json.dumps(framework_names), int(git.is_git), git.branch, git.commit,
                 repo.id),
            )


def _recursive_counts(repo_id: str, dir_files: dict[str, int]) -> list[tuple[str, str, int]]:
    """Direct file counts -> counts that include every nested file (what the folder tree displays)."""
    totals = dict(dir_files)
    for path in sorted(dir_files, key=lambda p: p.count("/"), reverse=True):
        if path:
            parent = path.rsplit("/", 1)[0] if "/" in path else ""
            totals[parent] = totals.get(parent, 0) + totals[path]
    return [(repo_id, path, count) for path, count in totals.items()]
