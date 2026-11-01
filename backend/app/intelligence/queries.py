"""Read-side queries for the code intelligence tables. Nothing here touches files on disk."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from ..db import Database
from ..errors import ApiError
from .model import CLASS_KINDS, FUNCTION_KINDS

STATUSES = {"parsed", "partial", "unsupported", "skipped", "failed"}
DEP_TYPES = {"internal", "external", "stdlib", "unresolved"}
ALL_KINDS = {
    "class", "interface", "enum", "struct", "trait", "record", "function", "method", "constructor", "variable",
    "constant", "property", "namespace", "type_alias", "macro",
}
RESOLUTION_NOTE = (
    "Static, best-effort classification from repository files and manifests. Packages installed in virtualenvs or "
    "node_modules, build-system path rules and dynamic imports are not evaluated; such imports stay 'unresolved'."
)


def _like(text: str) -> str:
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _split(value: str | None, allowed: set[str], label: str) -> list[str]:
    items = [v.strip() for v in (value or "").split(",") if v.strip()]
    bad = [v for v in items if v not in allowed]
    if bad:
        raise ApiError(422, f"invalid_{label}", f"Unknown {label}: {', '.join(bad)}. Allowed: {', '.join(sorted(allowed))}")
    return items


def relative_name(parent: str | None, name: str) -> str:
    return f"{parent}.{name}" if parent else name


class IntelligenceQueries:
    def __init__(self, db: Database):
        self.db = db

    def _require_repo(self, conn, repo_id: str) -> None:
        if conn.execute("SELECT 1 FROM repositories WHERE id=?", (repo_id,)).fetchone() is None:
            raise ApiError(404, "repository_not_found", "Repository not found.")

    # ---- run status ------------------------------------------------------------------------
    def run_status(self, run_id: str | None = None, repo_id: str | None = None) -> dict:
        with self.db.session() as conn:
            if run_id:
                row = conn.execute("SELECT * FROM parse_runs WHERE id=?", (run_id,)).fetchone()
            else:
                self._require_repo(conn, repo_id)
                row = conn.execute(
                    "SELECT * FROM parse_runs WHERE repository_id=? ORDER BY started_at DESC, rowid DESC LIMIT 1", (repo_id,)
                ).fetchone()
            if row is None:
                raise ApiError(404, "parse_run_not_found", "No parsing run found.")
            problems = conn.execute(
                "SELECT path, status, message FROM code_files WHERE repository_id=? AND last_run_id=?"
                " AND status IN ('partial','failed','skipped') ORDER BY status DESC, path LIMIT 50",
                (row["repository_id"], row["id"]),
            ).fetchall()
        remaining = None
        if row["status"] == "running" and row["progress"] >= 5:
            elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(row["started_at"])).total_seconds()
            remaining = max(0, int(elapsed * (100 - row["progress"]) / row["progress"]))
        data = {k: row[k] for k in row.keys() if k != "force"}
        data.update(run_id=data.pop("id"), forced=bool(row["force"]), seconds_remaining=remaining,
                    problems=[dict(p) for p in problems])
        return data

    # ---- files -----------------------------------------------------------------------------
    def parsed_files(self, repo_id: str, status: str | None, language: str | None, q: str | None,
                     limit: int, offset: int) -> dict:
        if status and status not in STATUSES:
            raise ApiError(422, "invalid_status", f"status must be one of {sorted(STATUSES)}")
        where, args = ["repository_id=?"], [repo_id]
        if status:
            where.append("status=?"); args.append(status)
        if language:
            where.append("language=?"); args.append(language)
        if q:
            where.append("path LIKE ? ESCAPE '\\'"); args.append(_like(q))
        clause = " AND ".join(where)
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            total = conn.execute(f"SELECT COUNT(*) FROM code_files WHERE {clause}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT path, language, status, syntax_errors, first_error_line, symbol_count, import_count, message,"
                f" parsed_at, sha256 FROM code_files WHERE {clause} ORDER BY path LIMIT ? OFFSET ?", (*args, limit, offset)
            ).fetchall()
            by_status = {r[0]: r[1] for r in conn.execute(
                "SELECT status, COUNT(*) FROM code_files WHERE repository_id=? GROUP BY status", (repo_id,))}
        return {"total": total, "by_status": by_status, "items": [dict(r) for r in rows]}

    # ---- symbols ---------------------------------------------------------------------------
    def _symbol_dict(self, row) -> dict:
        return {
            "id": row["id"], "name": row["name"], "kind": row["kind"], "qualified_name": row["qualified_name"],
            "parent": row["parent"], "path": row["path"], "language": row["language"], "start_line": row["start_line"],
            "end_line": row["end_line"], "signature": row["signature"], "parameters": json.loads(row["parameters_json"]),
            "return_type": row["return_type"], "decorators": json.loads(row["decorators_json"]),
            "bases": json.loads(row["bases_json"]), "interfaces": json.loads(row["interfaces_json"]),
            "docstring": row["docstring"], "exported": bool(row["exported"]),
        }

    def symbols(self, repo_id: str, q: str | None, kinds: list[str], language: str | None, path: str | None,
                exact: bool, exported: bool | None, limit: int, offset: int) -> dict:
        where, args = ["repository_id=?"], [repo_id]
        if q:
            if exact:
                where.append("name = ? COLLATE NOCASE"); args.append(q)
            else:
                where.append("name LIKE ? ESCAPE '\\'"); args.append(_like(q))
        if kinds:
            where.append(f"kind IN ({','.join('?' * len(kinds))})"); args += kinds
        if language:
            where.append("language=? COLLATE NOCASE"); args.append(language)
        if path:
            where.append("path=?"); args.append(path)
        if exported is not None:
            where.append("exported=?"); args.append(int(exported))
        clause = " AND ".join(where)
        order = "name COLLATE NOCASE, path, start_line"
        order_args: list = []
        if q and not exact:
            order = "(name = ? COLLATE NOCASE) DESC, (name LIKE ? ESCAPE '\\') DESC, length(name), " + order
            order_args = [q, q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"]
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            total = conn.execute(f"SELECT COUNT(*) FROM symbols WHERE {clause}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM symbols WHERE {clause} ORDER BY {order} LIMIT ? OFFSET ?", (*args, *order_args, limit, offset)
            ).fetchall()
            items = [self._symbol_dict(r) for r in rows]
            self._attach_relationships(conn, repo_id, items)
        return {"total": total, "items": items}

    def _attach_relationships(self, conn, repo_id: str, items: list[dict]) -> None:
        for item in items:
            item["relationships"] = []
        paths = sorted({i["path"] for i in items})
        if not paths:
            return
        rows = conn.execute(
            f"SELECT path, source, relation, target, target_path FROM relations WHERE repository_id=? AND relation!='calls'"
            f" AND path IN ({','.join('?' * len(paths))})", (repo_id, *paths),
        ).fetchall()
        grouped: dict[tuple[str, str], list[dict]] = {}
        for r in rows:
            grouped.setdefault((r["path"], r["source"]), []).append(
                {"relation": r["relation"], "target": r["target"], "target_path": r["target_path"]}
            )
        for item in items:
            item["relationships"] = grouped.get((item["path"], relative_name(item["parent"], item["name"])), [])

    def symbol(self, repo_id: str, symbol_id: int) -> dict:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            row = conn.execute("SELECT * FROM symbols WHERE repository_id=? AND id=?", (repo_id, symbol_id)).fetchone()
            if row is None:
                raise ApiError(404, "symbol_not_found", "Symbol not found.")
            item = self._symbol_dict(row)
            self._attach_relationships(conn, repo_id, [item])
        return item

    def references(self, repo_id: str, symbol_id: int, limit: int) -> dict:
        """Files that import the defining file, and name-based references (calls, inheritance).
        There is no type resolution: a call counts as 'high' confidence only when the calling file is the
        defining file or imports it; otherwise it is a name match and says so."""
        symbol = self.symbol(repo_id, symbol_id)
        name, path = symbol["name"], symbol["path"]
        with self.db.session() as conn:
            import_rows = conn.execute(
                "SELECT path, line, module, kind, names_json FROM imports WHERE repository_id=? AND resolved_path=? AND path!=?"
                " ORDER BY path, line", (repo_id, path, path),
            ).fetchall()
            importers = {r["path"] for r in import_rows}
            relation_rows = conn.execute(
                "SELECT path, source, relation, target, line FROM relations WHERE repository_id=? AND target LIKE ? ESCAPE '\\'"
                " ORDER BY path, line, id", (repo_id, _like(name)),
            ).fetchall()
        imported_by = []
        for r in import_rows:
            names = json.loads(r["names_json"])
            evidence = "imports-symbol" if name in names else "imports-module"
            imported_by.append({"path": r["path"], "line": r["line"], "module": r["module"], "kind": r["kind"],
                                "names": names, "evidence": evidence})
        references = []
        for r in relation_rows:
            if name not in re.split(r"[.:\\<>\s,]+", r["target"]):  # whole-name match, not a substring
                continue
            confidence = "high" if (r["path"] == path or r["path"] in importers) else "name-match-only"
            references.append({"path": r["path"], "line": r["line"], "kind": r["relation"],
                               "source": r["source"], "confidence": confidence})
        references.sort(key=lambda x: (x["confidence"] != "high", x["path"], x["line"]))
        return {
            "symbol": symbol,
            "imported_by": imported_by[:limit],
            "imported_by_total": len(imported_by),
            "references": references[:limit],
            "references_total": len(references),
            "note": "References are matched by name from parsed call sites and inheritance clauses; "
                    "'high' means the file is the defining file or imports it. Dynamic access is not tracked.",
        }

    # ---- structure of one file -------------------------------------------------------------
    def structure(self, repo_id: str, path: str) -> dict:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            file = conn.execute("SELECT * FROM code_files WHERE repository_id=? AND path=?", (repo_id, path)).fetchone()
            if file is None:
                raise ApiError(404, "file_not_parsed", "This file has not been parsed (run code parsing, or the path is not a source file).")
            sym_rows = conn.execute(
                "SELECT * FROM symbols WHERE repository_id=? AND path=? ORDER BY start_line, id", (repo_id, path)
            ).fetchall()
            imports = conn.execute(
                "SELECT line, module, kind, names_json, alias, level, dep_type, resolved_path, package, note FROM imports"
                " WHERE repository_id=? AND path=? ORDER BY line, id", (repo_id, path)
            ).fetchall()
            relations = conn.execute(
                "SELECT source, relation, target, line, target_path FROM relations WHERE repository_id=? AND path=? ORDER BY line, id",
                (repo_id, path),
            ).fetchall()
        flat = [self._symbol_dict(r) for r in sym_rows]
        nodes: dict[str, dict] = {}
        for s in flat:
            s["children"] = []
            nodes.setdefault(relative_name(s["parent"], s["name"]), s)
        roots = []
        for s in flat:
            parent = nodes.get(s["parent"]) if s["parent"] else None
            (parent["children"] if parent is not None and parent is not s else roots).append(s)
        return {
            "path": path, "language": file["language"], "status": file["status"], "syntax_errors": file["syntax_errors"],
            "first_error_line": file["first_error_line"], "message": file["message"], "namespace": file["namespace"],
            "module_docstring": file["module_docstring"], "parsed_at": file["parsed_at"],
            "symbols": roots, "symbol_count": len(flat),
            "imports": [
                {"line": i["line"], "module": i["module"], "kind": i["kind"], "names": json.loads(i["names_json"]),
                 "alias": i["alias"], "dep_type": i["dep_type"], "resolved_path": i["resolved_path"],
                 "package": i["package"], "note": i["note"]} for i in imports
            ],
            "relations": [
                {"source": r["source"], "relation": r["relation"], "target": r["target"], "line": r["line"],
                 "target_path": r["target_path"]} for r in relations if r["relation"] != "calls"
            ],
            "calls": [{"source": r["source"], "target": r["target"], "line": r["line"]}
                      for r in relations if r["relation"] == "calls"][:500],
        }

    # ---- imports and dependencies ----------------------------------------------------------
    def imports(self, repo_id: str, path: str | None, dep_type: str | None, q: str | None, limit: int, offset: int) -> dict:
        if dep_type and dep_type not in DEP_TYPES:
            raise ApiError(422, "invalid_dep_type", f"dep_type must be one of {sorted(DEP_TYPES)}")
        where, args = ["repository_id=?"], [repo_id]
        if path:
            where.append("path=?"); args.append(path)
        if dep_type:
            where.append("dep_type=?"); args.append(dep_type)
        if q:
            where.append("module LIKE ? ESCAPE '\\'"); args.append(_like(q))
        clause = " AND ".join(where)
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            total = conn.execute(f"SELECT COUNT(*) FROM imports WHERE {clause}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT path, line, module, kind, names_json, alias, dep_type, resolved_path, package, note FROM imports"
                f" WHERE {clause} ORDER BY path, line, id LIMIT ? OFFSET ?", (*args, limit, offset)
            ).fetchall()
        items = [{**{k: r[k] for k in r.keys() if k != "names_json"}, "names": json.loads(r["names_json"])} for r in rows]
        return {"total": total, "items": items}

    def dependency_summary(self, repo_id: str) -> dict:
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            counts = {r[0]: r[1] for r in conn.execute(
                "SELECT dep_type, COUNT(*) FROM imports WHERE repository_id=? GROUP BY dep_type", (repo_id,))}
            files_with_imports = conn.execute(
                "SELECT COUNT(DISTINCT path) FROM imports WHERE repository_id=?", (repo_id,)).fetchone()[0]
            external = conn.execute(
                "SELECT package, COUNT(DISTINCT path) AS files, COUNT(*) AS imports FROM imports WHERE repository_id=?"
                " AND dep_type='external' AND package IS NOT NULL GROUP BY package ORDER BY files DESC, package LIMIT 200",
                (repo_id,)).fetchall()
            stdlib = conn.execute(
                "SELECT module, COUNT(DISTINCT path) AS files FROM imports WHERE repository_id=? AND dep_type='stdlib'"
                " GROUP BY module ORDER BY files DESC, module LIMIT 100", (repo_id,)).fetchall()
            unresolved = conn.execute(
                "SELECT module, COUNT(DISTINCT path) AS files, MIN(note) AS note FROM imports WHERE repository_id=?"
                " AND dep_type='unresolved' GROUP BY module ORDER BY files DESC, module LIMIT 200", (repo_id,)).fetchall()
            internal_edges = conn.execute(
                "SELECT COUNT(*) FROM (SELECT DISTINCT path, resolved_path FROM imports WHERE repository_id=?"
                " AND dep_type='internal' AND resolved_path IS NOT NULL AND resolved_path!=path)", (repo_id,)).fetchone()[0]
            unlocated = conn.execute(
                "SELECT COUNT(*) FROM imports WHERE repository_id=? AND dep_type='internal' AND resolved_path IS NULL",
                (repo_id,)).fetchone()[0]
        return {
            "files_with_imports": files_with_imports,
            "counts": {t: counts.get(t, 0) for t in sorted(DEP_TYPES)},
            "internal_file_edges": internal_edges,
            "internal_without_file": unlocated,
            "external_packages": [dict(r) for r in external],
            "stdlib_modules": [dict(r) for r in stdlib],
            "unresolved": [dict(r) for r in unresolved],
            "resolution": RESOLUTION_NOTE,
        }

    def graph(self, repo_id: str, types: list[str], with_relations: bool, limit: int) -> dict:
        """Nodes and edges shaped for networkx.DiGraph (node id + attrs, edge source/target + attrs)."""
        types = types or ["internal", "external", "unresolved"]
        nodes: dict[str, dict] = {}
        edges: dict[tuple[str, str, str], dict] = {}
        truncated = False
        with self.db.session() as conn:
            self._require_repo(conn, repo_id)
            lang = {r[0]: r[1] for r in conn.execute("SELECT path, language FROM code_files WHERE repository_id=?", (repo_id,))}
            rows = conn.execute(
                f"SELECT path, module, dep_type, resolved_path, package, kind, names_json FROM imports WHERE repository_id=?"
                f" AND dep_type IN ({','.join('?' * len(types))}) ORDER BY path, line", (repo_id, *types),
            ).fetchall()
            for r in rows:
                src = r["path"]
                if r["dep_type"] == "internal":
                    if not r["resolved_path"] or r["resolved_path"] == src:
                        continue
                    dst, node = r["resolved_path"], {"type": "file", "language": lang.get(r["resolved_path"])}
                elif r["dep_type"] == "external":
                    dst, node = f"pkg:{r['package'] or r['module']}", {"type": "external", "label": r["package"] or r["module"]}
                elif r["dep_type"] == "stdlib":
                    dst, node = f"std:{r['module']}", {"type": "stdlib", "label": r["module"]}
                else:
                    dst, node = f"unresolved:{r['module']}", {"type": "unresolved", "label": r["module"]}
                key = (src, dst, "imports")
                if key not in edges and len(edges) >= limit:
                    truncated = True
                    continue
                nodes.setdefault(src, {"type": "file", "language": lang.get(src)})
                nodes.setdefault(dst, node)
                edge = edges.setdefault(key, {"source": src, "target": dst, "relation": "imports", "dep_type": r["dep_type"], "count": 0, "names": []})
                edge["count"] += 1
                edge["names"] = sorted(set(edge["names"]) | set(json.loads(r["names_json"])))[:20]
            if with_relations:
                for r in conn.execute(
                    "SELECT path, relation, target, target_path FROM relations WHERE repository_id=? AND target_path IS NOT NULL"
                    " AND relation IN ('extends','implements','uses','includes') AND target_path!=path", (repo_id,)):
                    key = (r["path"], r["target_path"], r["relation"])
                    if key not in edges and len(edges) >= limit:
                        truncated = True
                        continue
                    nodes.setdefault(r["path"], {"type": "file", "language": lang.get(r["path"])})
                    nodes.setdefault(r["target_path"], {"type": "file", "language": lang.get(r["target_path"])})
                    edge = edges.setdefault(key, {"source": r["path"], "target": r["target_path"], "relation": r["relation"],
                                                  "dep_type": "internal", "count": 0, "names": []})
                    edge["count"] += 1
                    edge["names"] = sorted(set(edge["names"]) | {r["target"]})[:20]
        return {
            "directed": True,
            "nodes": [{"id": k, **v} for k, v in sorted(nodes.items())],
            "edges": list(edges.values()),
            "truncated": truncated,
            "resolution": RESOLUTION_NOTE,
        }

    def kinds_for(self, group: str) -> list[str]:
        return list(CLASS_KINDS if group == "classes" else FUNCTION_KINDS)

    def parse_kinds(self, value: str | None) -> list[str]:
        return _split(value, ALL_KINDS, "kind")

    def parse_types(self, value: str | None) -> list[str]:
        return _split(value, DEP_TYPES, "dep_type")
