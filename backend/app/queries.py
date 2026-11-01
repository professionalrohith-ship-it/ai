"""Read-side queries over the scan tables. Nothing here touches the repository's files on disk."""
from __future__ import annotations

import json
import posixpath
from datetime import datetime, timezone

from .db import Database
from .errors import ApiError

STAGES = ["initialise", "discover", "languages", "frameworks", "config", "inventory", "complete"]
CATEGORIES = {"source", "test", "doc", "config", "manifest", "other"}


def clean_relative_path(raw: str) -> str:
    """Repo-relative path from a query string. Rejects traversal; the result is only used as a DB key."""
    text = (raw or "").replace("\\", "/").strip("/")
    if "\0" in text or text.startswith("~") or (len(text) > 1 and text[1] == ":"):
        raise ApiError(422, "invalid_path", "Invalid path.")
    parts = [p for p in text.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ApiError(422, "invalid_path", "Path traversal is not allowed.")
    return posixpath.join(*parts) if parts else ""


class Queries:
    def __init__(self, db: Database):
        self.db = db

    def _require_repo(self, conn, repo_id: str) -> None:
        if conn.execute("SELECT 1 FROM repositories WHERE id=?", (repo_id,)).fetchone() is None:
            raise ApiError(404, "repository_not_found", "Repository not found.")

    # ---- scans -----------------------------------------------------------------------------
    def scan_progress(self, scan_id: str | None = None, repo_id: str | None = None) -> dict:
        with self.db.session() as conn:
            if scan_id:
                row = conn.execute("SELECT * FROM scans WHERE id=?", (scan_id,)).fetchone()
            else:
                self._require_repo(conn, repo_id)
                row = conn.execute(
                    "SELECT * FROM scans WHERE repository_id=? ORDER BY started_at DESC, rowid DESC LIMIT 1", (repo_id,)
                ).fetchone()
            if row is None:
                raise ApiError(404, "scan_not_found", "No scan found.")
            errors = conn.execute(
                "SELECT path, message FROM scan_errors WHERE scan_id=? ORDER BY id LIMIT 50", (row["id"],)
            ).fetchall()
            error_count = conn.execute(
                "SELECT COUNT(*) FROM scan_errors WHERE scan_id=?", (row["id"],)
            ).fetchone()[0]

        remaining = None
        if row["status"] == "running" and row["progress"] >= 5:
            started = datetime.fromisoformat(row["started_at"])
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            remaining = max(0, int(elapsed * (100 - row["progress"]) / row["progress"]))
        return {
            "scan_id": row["id"],
            "repository_id": row["repository_id"],
            "status": row["status"],
            "stage": row["stage"],
            "stage_index": STAGES.index(row["stage"]) if row["stage"] in STAGES else 0,
            "progress": row["progress"],
            "files_discovered": row["files_discovered"],
            "folders_discovered": row["folders_discovered"],
            "files_changed": row["files_changed"],
            "files_unchanged": row["files_unchanged"],
            "languages_detected": json.loads(row["languages_json"]),
            "frameworks_detected": json.loads(row["frameworks_json"]),
            "seconds_remaining": remaining,
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "error": row["error"],
            "error_count": error_count,
            "errors": [{"path": e["path"], "message": e["message"]} for e in errors],
        }

    # ---- results ---------------------------------------------------------------------------
    def languages(self, repo_id: str) -> list[dict]:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            rows = conn.execute(
                "SELECT language, COUNT(*) AS files, SUM(size_bytes) AS bytes, COALESCE(SUM(line_count),0) AS lines"
                " FROM files WHERE repository_id=? AND language IS NOT NULL AND category!='doc'"
                " GROUP BY language ORDER BY bytes DESC, language", (repo_id,)
            ).fetchall()
        total = sum(r["bytes"] for r in rows) or 1
        return [
            {"name": r["language"], "files": r["files"], "bytes": r["bytes"], "lines": r["lines"],
             "percent": round(r["bytes"] * 100 / total, 1)}
            for r in rows
        ]

    def technologies(self, repo_id: str) -> list[dict]:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            rows = conn.execute(
                "SELECT name, category, version, source, confidence FROM technologies WHERE repository_id=?"
                " ORDER BY category, name", (repo_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def files(self, repo_id: str, category: str | None, language: str | None, query: str | None,
              entry_points: bool, limit: int, offset: int) -> dict:
        if category and category not in CATEGORIES:
            raise ApiError(422, "invalid_category", f"category must be one of {sorted(CATEGORIES)}")
        where, args = ["repository_id=?"], [repo_id]
        if category:
            where.append("category=?"); args.append(category)
        if language:
            where.append("language=?"); args.append(language)
        if entry_points:
            where.append("is_entry_point=1")
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            where.append("path LIKE ? ESCAPE '\\'"); args.append(f"%{escaped}%")
        clause = " AND ".join(where)
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            total = conn.execute(f"SELECT COUNT(*) FROM files WHERE {clause}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT path, name, extension, language, category, size_bytes, line_count, sha256, mtime_ns,"
                f" is_entry_point, is_sensitive FROM files WHERE {clause} ORDER BY path LIMIT ? OFFSET ?",
                (*args, limit, offset),
            ).fetchall()
        return {"total": total, "items": [dict(r) for r in rows]}

    def tree(self, repo_id: str, base: str, depth: int) -> list[dict]:
        """Folder/file tree below `base` (repo-relative), nested up to `depth` levels. Built from the DB."""
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            prefix = base + "/" if base else ""
            if base and conn.execute(
                "SELECT 1 FROM directories WHERE repository_id=? AND path=?", (repo_id, base)
            ).fetchone() is None:
                raise ApiError(404, "path_not_found", "Folder not found in this repository.")
            like = _like_prefix(prefix)
            dirs = conn.execute(
                "SELECT path, file_count FROM directories WHERE repository_id=? AND path LIKE ? ESCAPE '\\' AND path!=''",
                (repo_id, like),
            ).fetchall()
            files = conn.execute(
                "SELECT path FROM files WHERE repository_id=? AND path LIKE ? ESCAPE '\\'", (repo_id, like)
            ).fetchall()

        root: dict = {"children": {}}

        def node_for(path: str) -> dict:
            node = root
            for part in path[len(prefix):].split("/"):
                node = node["children"].setdefault(part, {"children": {}})
            return node

        for d in dirs:
            node = node_for(d["path"])
            node.update(path=d["path"], type="folder", file_count=d["file_count"])
        for f in files:
            node = node_for(f["path"])
            node.update(path=f["path"], type="file")

        def render(node: dict, level: int) -> list[dict]:
            out = []
            for name, child in sorted(
                node["children"].items(), key=lambda kv: (kv[1].get("type") != "folder", kv[0].lower())
            ):
                if "type" not in child:  # implied folder (should not happen once a scan completed)
                    continue
                item = {"path": child["path"], "name": name, "type": child["type"]}
                if child["type"] == "folder":
                    item["file_count"] = child.get("file_count", 0)
                    if level < depth:
                        item["children"] = render(child, level + 1)
                out.append(item)
            return out

        return render(root, 1)

    def result(self, repo_id: str) -> dict:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            scan = conn.execute(
                "SELECT * FROM scans WHERE repository_id=? AND status='completed' ORDER BY finished_at DESC, rowid DESC LIMIT 1",
                (repo_id,),
            ).fetchone()
            if scan is None:
                raise ApiError(404, "no_completed_scan", "This repository has not been scanned yet.")
            counts = {
                r["category"]: r["n"]
                for r in conn.execute(
                    "SELECT category, COUNT(*) AS n FROM files WHERE repository_id=? GROUP BY category", (repo_id,)
                )
            }
            entries = [
                r["path"] for r in conn.execute(
                    "SELECT path FROM files WHERE repository_id=? AND is_entry_point=1 ORDER BY path LIMIT 100", (repo_id,)
                )
            ]
            managers = [
                r["name"] for r in conn.execute(
                    "SELECT name FROM technologies WHERE repository_id=? AND category='package-manager' ORDER BY name",
                    (repo_id,),
                )
            ]
            tech_count = conn.execute(
                "SELECT COUNT(*) FROM technologies WHERE repository_id=?", (repo_id,)
            ).fetchone()[0]
            sensitive = conn.execute(
                "SELECT COUNT(*) FROM files WHERE repository_id=? AND is_sensitive=1", (repo_id,)
            ).fetchone()[0]
            repo = conn.execute(
                "SELECT is_git, branch, commit_hash FROM repositories WHERE id=?", (repo_id,)
            ).fetchone()
            error_count = conn.execute(
                "SELECT COUNT(*) FROM scan_errors WHERE scan_id=?", (scan["id"],)
            ).fetchone()[0]
        summary = json.loads(scan["summary_json"] or "{}")
        return {
            "scan_id": scan["id"],
            "repository_id": repo_id,
            "completed_at": scan["finished_at"],
            "duration_seconds": summary.get("durationSeconds", 0),
            "files": scan["files_discovered"],
            "folders": scan["folders_discovered"],
            "files_changed": scan["files_changed"],
            "files_unchanged": scan["files_unchanged"],
            "languages": [
                {"name": l["name"], "percent": l["percent"], "files": l["files"]} for l in self.languages(repo_id)
            ],
            "frameworks": json.loads(scan["frameworks_json"]),
            "technology_count": tech_count,
            "package_managers": managers,
            "entry_points": entries,
            "file_categories": {c: counts.get(c, 0) for c in sorted(CATEGORIES)},
            "sensitive_files_skipped": sensitive,
            "skipped": summary.get("skipped", {}),
            "truncated": summary.get("truncated", False),
            "error_count": error_count,
            "git": {"is_git": bool(repo["is_git"]), "branch": repo["branch"], "commit": repo["commit_hash"]},
            "is_demo": False,
        }


def _like_prefix(prefix: str) -> str:
    escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return escaped + "%"
