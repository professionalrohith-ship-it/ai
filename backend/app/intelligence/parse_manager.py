"""Background code-parsing runs: incremental, per-file fault tolerant, persisted in SQLite."""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from ..config import Settings
from ..db import Database
from ..errors import ApiError
from ..repo_service import RepositoryRow, RepositoryService, utcnow, validate_path
from . import resolver
from .manifests import load_declared
from .model import CLASS_KINDS, ParseResult
from .parser import ParserPool, is_supported, parse_source

PARSER_VERSION = "s3.1"  # bump when extraction output changes: forces a re-parse of every file
PAGE = 500
GENERATED_MARKERS = re.compile(rb"@generated|DO NOT EDIT|Code generated|auto-?generated", re.I)
COMMENT_STARTS = (b"#", b"//", b"/*", b"*", b"--", b"<!--", b";", b'"""', b"'''")
HEADER_LINES = 10
RELATION_TARGET_KINDS = ("extends", "implements", "uses", "includes")
RESOLVE_CHUNK = 2000


@dataclass
class FileOutcome:
    status: str  # parsed | partial | unsupported | skipped | failed
    sha256: str | None
    message: str | None = None
    result: ParseResult | None = None


def _check_text(data: bytes) -> str | None:
    """Reason to skip, or None when the content looks like hand-written text source."""
    if b"\0" in data[:8192]:
        return "binary content"
    for line in data[:2048].splitlines()[:HEADER_LINES]:  # only a marker inside a header comment counts
        stripped = line.strip()
        if stripped.startswith(COMMENT_STARTS) and GENERATED_MARKERS.search(stripped):
            return "generated file"
    lines = data.count(b"\n") + 1
    if len(data) > 5000 and len(data) / lines > 400:
        return "generated or minified file (very long lines)"
    return None


def analyze_file(root_real: str, rel: str, language: str | None, extension: str, inventory_sha: str | None,
                 max_bytes: int, pool: ParserPool) -> FileOutcome:
    """Read and parse one file. Never raises; every problem becomes a status + message."""
    if not is_supported(language, extension):
        return FileOutcome("unsupported", inventory_sha, f"no grammar for {language or extension}")
    full = os.path.join(root_real, *rel.split("/"))
    try:
        info = os.lstat(full)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            return FileOutcome("skipped", inventory_sha, "not a regular file")
        if info.st_size > max_bytes:
            return FileOutcome("skipped", inventory_sha, f"oversize ({info.st_size} bytes, limit {max_bytes})")
        real = os.path.realpath(full)
        if os.path.commonpath([root_real, real]) != root_real:
            return FileOutcome("skipped", inventory_sha, "resolves outside the repository")
        with open(full, "rb") as handle:
            data = handle.read(max_bytes + 1)
    except FileNotFoundError:
        return FileOutcome("failed", None, "file no longer exists (rescan the repository)")
    except PermissionError:
        return FileOutcome("failed", None, "permission denied")
    except (OSError, ValueError) as exc:
        return FileOutcome("failed", None, f"cannot read file: {exc}")
    if len(data) > max_bytes:
        return FileOutcome("skipped", inventory_sha, f"oversize (limit {max_bytes} bytes)")
    sha = hashlib.sha256(data).hexdigest()
    reason = _check_text(data)
    if reason:
        return FileOutcome("skipped", sha, reason)
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    try:
        result = parse_source(data, language, extension, pool)
    except Exception as exc:  # noqa: BLE001 - a parser/extractor bug on one file must not stop the run
        return FileOutcome("failed", sha, f"{type(exc).__name__}: {exc}"[:300])
    if result.syntax_errors:
        message = f"{result.syntax_errors} syntax error node(s), first near line {result.first_error_line}"
        return FileOutcome("partial", sha, message, result)
    return FileOutcome("parsed", sha, None, result)


def _relative_name(parent: str | None, name: str) -> str:
    return f"{parent}.{name}" if parent else name


def _decorator_name(text: str) -> str:
    return text.split("(")[0].strip()[:120]


def store_file(conn, repo_id: str, run_id: str, rel: str, language: str | None, outcome: FileOutcome) -> None:
    """Replace everything stored for one file (no duplicates on re-parse)."""
    for table in ("symbols", "imports", "relations"):
        conn.execute(f"DELETE FROM {table} WHERE repository_id=? AND path=?", (repo_id, rel))
    result = outcome.result
    if result is not None:
        conn.executemany(
            "INSERT INTO symbols (repository_id, path, name, kind, qualified_name, parent, language, start_line, end_line,"
            " signature, parameters_json, return_type, decorators_json, bases_json, interfaces_json, docstring, exported)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(repo_id, rel, s.name, s.kind, s.qualified_name, s.parent, s.language, s.start_line, s.end_line, s.signature,
              json.dumps(s.parameters), s.return_type, json.dumps(s.decorators), json.dumps(s.bases),
              json.dumps(s.interfaces), s.docstring, int(s.exported)) for s in result.symbols],
        )
        conn.executemany(
            "INSERT INTO imports (repository_id, path, line, module, kind, names_json, alias, level) VALUES (?,?,?,?,?,?,?,?)",
            [(repo_id, rel, i.line, i.module, i.kind, json.dumps(i.names), i.alias, i.level) for i in result.imports],
        )
        relations = [(repo_id, rel, r.source, r.relation, r.target[:200], r.line) for r in result.relations]
        for s in result.symbols:
            source = _relative_name(s.parent, s.name)
            relations += [(repo_id, rel, source, "extends", b[:200], s.start_line) for b in s.bases]
            relations += [(repo_id, rel, source, "implements", i[:200], s.start_line) for i in s.interfaces]
            relations += [(repo_id, rel, source, "decorated_by", _decorator_name(d), s.start_line) for d in s.decorators]
        conn.executemany(
            "INSERT INTO relations (repository_id, path, source, relation, target, line) VALUES (?,?,?,?,?,?)", relations
        )
    conn.execute(
        "INSERT INTO code_files (repository_id, path, sha256, language, status, syntax_errors, first_error_line,"
        " symbol_count, import_count, namespace, module_docstring, message, parser_version, parsed_at, last_run_id)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(repository_id, path) DO UPDATE SET sha256=excluded.sha256, language=excluded.language,"
        " status=excluded.status, syntax_errors=excluded.syntax_errors, first_error_line=excluded.first_error_line,"
        " symbol_count=excluded.symbol_count, import_count=excluded.import_count, namespace=excluded.namespace,"
        " module_docstring=excluded.module_docstring, message=excluded.message, parser_version=excluded.parser_version,"
        " parsed_at=excluded.parsed_at, last_run_id=excluded.last_run_id",
        (repo_id, rel, outcome.sha256, language, outcome.status, result.syntax_errors if result else 0,
         result.first_error_line if result else None, len(result.symbols) if result else 0,
         len(result.imports) if result else 0, result.namespace if result else None,
         result.module_docstring if result else None, outcome.message, PARSER_VERSION, utcnow(), run_id),
    )


class ParseManager:
    def __init__(self, settings: Settings, db: Database, repos: RepositoryService):
        self.settings = settings
        self.db = db
        self.repos = repos
        self.pool = ThreadPoolExecutor(max_workers=settings.parse_workers, thread_name_prefix="parse")
        self.futures: dict[str, Future] = {}
        self._lock = threading.Lock()

    def recover_interrupted(self) -> None:
        with self.db.tx() as conn:
            conn.execute(
                "UPDATE parse_runs SET status='failed', finished_at=?, error='Interrupted by a server restart'"
                " WHERE status IN ('queued','running')", (utcnow(),)
            )

    def shutdown(self) -> None:
        self.pool.shutdown(wait=False, cancel_futures=True)

    def wait(self, run_id: str, timeout: float = 60) -> None:
        future = self.futures.get(run_id)
        if future:
            future.result(timeout=timeout)

    def start(self, repo_id: str, force: bool = False) -> str:
        repo = self.repos.get(repo_id)
        run_id = f"parse-{uuid.uuid4().hex[:12]}"
        with self._lock, self.db.tx() as conn:
            if repo.last_scanned_at is None:
                raise ApiError(409, "scan_required", "Scan this repository first: parsing works from the scan's file inventory.")
            if conn.execute("SELECT 1 FROM scans WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)).fetchone():
                raise ApiError(409, "scan_running", "Wait for the running scan to finish before parsing.")
            if conn.execute("SELECT 1 FROM parse_runs WHERE repository_id=? AND status IN ('queued','running')", (repo_id,)).fetchone():
                raise ApiError(409, "parse_running", "A parsing run is already in progress for this repository.")
            conn.execute(
                "INSERT INTO parse_runs (id, repository_id, status, force, started_at) VALUES (?,?, 'queued', ?, ?)",
                (run_id, repo_id, int(force), utcnow()),
            )
        self.futures[run_id] = self.pool.submit(self._run, run_id, repo, force)
        return run_id

    # ---- run -------------------------------------------------------------------------------
    def _run(self, run_id: str, repo: RepositoryRow, force: bool) -> None:
        try:
            self._execute(run_id, repo, force)
        except Exception as exc:  # noqa: BLE001
            with self.db.tx() as conn:
                conn.execute(
                    "UPDATE parse_runs SET status='failed', finished_at=?, error=? WHERE id=?",
                    (utcnow(), f"{type(exc).__name__}: {exc}"[:500], run_id),
                )

    def _update(self, run_id: str, **fields) -> None:
        sets = ", ".join(f"{k}=?" for k in fields)
        with self.db.tx() as conn:
            conn.execute(f"UPDATE parse_runs SET status='running', {sets} WHERE id=?", (*fields.values(), run_id))

    def _execute(self, run_id: str, repo: RepositoryRow, force: bool) -> None:
        root = validate_path(repo.path).resolved  # moved/removed folders fail the run cleanly
        root_real = os.path.realpath(root)
        where = "repository_id=? AND language IS NOT NULL AND is_sensitive=0"
        with self.db.session() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM files WHERE {where}", (repo.id,)).fetchone()[0]
            existing = {
                r["path"]: (r["sha256"], r["parser_version"])
                for r in conn.execute("SELECT path, sha256, parser_version FROM code_files WHERE repository_id=?", (repo.id,))
            }
        self._update(run_id, stage="parse", total_files=total, progress=1)

        counts = dict(parsed=0, unchanged=0, partial=0, unsupported=0, skipped=0, failed=0)
        processed = 0
        pending: list[tuple[str, str | None, FileOutcome]] = []
        parsers = ParserPool()

        def flush() -> None:
            if not pending:
                return
            with self.db.tx() as conn:
                for rel, language, outcome in pending:
                    store_file(conn, repo.id, run_id, rel, language, outcome)
            pending.clear()

        def report() -> None:
            self._update(
                run_id, processed_files=processed, parsed_files=counts["parsed"], unchanged_files=counts["unchanged"],
                partial_files=counts["partial"], unsupported_files=counts["unsupported"], skipped_files=counts["skipped"],
                failed_files=counts["failed"], progress=1 + int(88 * processed / max(total, 1)),
            )

        last = ""
        while True:
            with self.db.session() as conn:
                page = conn.execute(
                    f"SELECT path, language, extension, sha256 FROM files WHERE {where} AND path>? ORDER BY path LIMIT ?",
                    (repo.id, last, PAGE),
                ).fetchall()
            if not page:
                break
            last = page[-1]["path"]
            for row in page:
                rel, language = row["path"], row["language"]
                known = existing.get(rel)
                if not force and known and known[0] == row["sha256"] and known[1] == PARSER_VERSION and row["sha256"]:
                    counts["unchanged"] += 1
                else:
                    outcome = analyze_file(root_real, rel, language, row["extension"], row["sha256"],
                                           self.settings.parse_max_file_bytes, parsers)
                    pending.append((rel, language, outcome))
                    key = {"parsed": "parsed", "partial": "partial", "unsupported": "unsupported",
                           "skipped": "skipped", "failed": "failed"}[outcome.status]
                    counts[key] += 1
                    if len(pending) >= self.settings.parse_batch:
                        flush()
                processed += 1
            flush()
            report()

        flush()
        self._update(run_id, stage="cleanup", progress=90)
        deleted = self._delete_stale(repo.id)

        self._update(run_id, stage="resolve", progress=93, deleted_files=deleted)
        self.resolve_dependencies(repo.id, root)

        self._update(run_id, stage="complete", processed_files=processed, parsed_files=counts["parsed"],
                     unchanged_files=counts["unchanged"], partial_files=counts["partial"],
                     unsupported_files=counts["unsupported"], skipped_files=counts["skipped"],
                     failed_files=counts["failed"], deleted_files=deleted)
        with self.db.tx() as conn:
            conn.execute("UPDATE parse_runs SET status='completed', progress=100, finished_at=? WHERE id=?", (utcnow(), run_id))

    def _delete_stale(self, repo_id: str) -> int:
        """Remove parse data for files that left the inventory (deleted, newly excluded, or no longer a source file)."""
        live = "SELECT path FROM files WHERE repository_id=? AND language IS NOT NULL AND is_sensitive=0"
        with self.db.tx() as conn:
            stale = conn.execute(
                f"SELECT COUNT(*) FROM code_files WHERE repository_id=? AND path NOT IN ({live})", (repo_id, repo_id)
            ).fetchone()[0]
            for table in ("symbols", "imports", "relations", "code_files"):
                conn.execute(f"DELETE FROM {table} WHERE repository_id=? AND path NOT IN ({live})", (repo_id, repo_id))
        return stale

    # ---- dependency classification -----------------------------------------------------------
    def resolve_dependencies(self, repo_id: str, root: Path) -> None:
        """Re-classify every import. Runs on all files each time because a change in one file can change
        how another file's imports resolve (a target appears or disappears)."""
        with self.db.session() as conn:
            paths = {r[0] for r in conn.execute("SELECT path FROM files WHERE repository_id=?", (repo_id,))}
            manifest_paths = [
                r[0] for r in conn.execute(
                    "SELECT path FROM files WHERE repository_id=? AND (category='manifest' OR name IN ('tsconfig.json','jsconfig.json'))",
                    (repo_id,),
                )
            ]
            types = {
                r[0]: r[1] for r in conn.execute(
                    "SELECT qualified_name, path FROM symbols WHERE repository_id=? AND language IN ('Java','C#','PHP')"
                    " AND kind IN ('class','interface','enum','struct','record','trait')", (repo_id,)
                )
            }
            namespaces = {r[0]: r[1] for r in conn.execute(
                "SELECT namespace, path FROM code_files WHERE repository_id=? AND namespace IS NOT NULL", (repo_id,))}
            namespaces.update({r[0]: r[1] for r in conn.execute(
                "SELECT qualified_name, path FROM symbols WHERE repository_id=? AND kind='namespace' AND language='C#'", (repo_id,))})
        index = resolver.RepoIndex(paths=paths, declared=load_declared(root, manifest_paths), type_names=types, namespaces=namespaces)

        with self.db.session() as reader:
            cursor = reader.execute(
                "SELECT i.id, i.path, i.module, i.kind, i.names_json, i.level, c.language FROM imports i"
                " JOIN code_files c ON c.repository_id=i.repository_id AND c.path=i.path WHERE i.repository_id=?", (repo_id,)
            )
            while True:
                chunk = cursor.fetchmany(RESOLVE_CHUNK)
                if not chunk:
                    break
                updates = []
                for row in chunk:
                    dep, resolved, package, note = resolver.resolve(
                        index, row["path"], row["language"], row["module"], row["kind"],
                        json.loads(row["names_json"]), row["level"],
                    )
                    updates.append((dep, resolved, resolver.clean_package(package), note, row["id"]))
                with self.db.tx() as conn:
                    conn.executemany("UPDATE imports SET dep_type=?, resolved_path=?, package=?, note=? WHERE id=?", updates)
        self._link_relations(repo_id)

    def _link_relations(self, repo_id: str) -> None:
        """target_path for extends/implements/uses/includes when the target type name is unique in the repository."""
        with self.db.session() as conn:
            by_name: dict[str, set[str]] = {}
            for r in conn.execute(
                f"SELECT name, path FROM symbols WHERE repository_id=? AND kind IN ({','.join('?' * len(CLASS_KINDS))})",
                (repo_id, *CLASS_KINDS),
            ):
                by_name.setdefault(r[0], set()).add(r[1])
            rows = conn.execute(
                f"SELECT id, target FROM relations WHERE repository_id=? AND relation IN ({','.join('?' * len(RELATION_TARGET_KINDS))})",
                (repo_id, *RELATION_TARGET_KINDS),
            ).fetchall()
        updates = []
        for row in rows:
            simple = re.split(r"[.:\\<]+", row["target"].strip())
            simple = [s for s in simple if s]
            paths = by_name.get(simple[-1] if simple else "", set())
            updates.append((next(iter(paths)) if len(paths) == 1 else None, row["id"]))
        with self.db.tx() as conn:
            conn.executemany("UPDATE relations SET target_path=? WHERE id=?", updates)
