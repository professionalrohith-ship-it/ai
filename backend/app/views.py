"""Read-only data for the UI pages (architecture, packages, file view, folder suggestions). No AI involved."""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tomllib
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .ai.reader import RepoReader
from .db import Database
from .errors import ApiError
from .intelligence.model import CLASS_KINDS
from .intelligence.resolver import PY_IMPORT_ALIASES
from .repo_service import RepositoryRow, RepositoryService
from .scanner.frameworks import _norm

MONOREPO_ROOTS = {"src", "app", "apps", "packages", "backend", "frontend", "server", "client", "lib", "services", "web"}
TYPE_NOTE = (
    "Module types are a heuristic based on folder names, languages and detected frameworks, not a verified "
    "architecture. Edges are aggregated static imports between modules."
)
FILE_VIEW_CAP = 1024 * 1024

_TYPE_NAMES = [
    ("client", {"client", "browser", "mobile", "ios", "android"}),
    ("api", {"api", "apis", "routes", "routers", "router", "controllers", "controller", "endpoints", "handlers", "rest", "graphql"}),
    ("database", {"db", "database", "models", "model", "migrations", "schema", "schemas", "entities", "dao", "storage", "repositories", "orm"}),
    ("frontend", {"frontend", "web", "ui", "pages", "components", "views", "public", "static", "assets", "styles", "hooks", "layouts", "templates", "screens"}),
    ("service", {"services", "service", "core", "domain", "lib", "utils", "helpers", "workers", "tasks", "jobs", "agents", "ai", "intelligence", "scanner", "engine", "logic", "business"}),
]
_FRONTEND_LANGS = {"HTML", "CSS", "SCSS", "Vue"}


# ---- shared ------------------------------------------------------------------------------------
def require_scanned(repos: RepositoryService, repo_id: str) -> RepositoryRow:
    repo = repos.get(repo_id)
    if repo.last_scanned_at is None:
        raise ApiError(409, "scan_required", "Scan this repository first: this view is built from the scan inventory.")
    return repo


def is_parsed(db: Database, repo_id: str) -> bool:
    with db.session() as conn:
        return conn.execute("SELECT 1 FROM code_files WHERE repository_id=? LIMIT 1", (repo_id,)).fetchone() is not None


def last_analysed(db: Database, repo_id: str) -> str | None:
    with db.session() as conn:
        row = conn.execute(
            "SELECT MAX(t) FROM (SELECT finished_at AS t FROM parse_runs WHERE repository_id=? AND status='completed'"
            " UNION ALL SELECT finished_at FROM scans WHERE repository_id=? AND status='completed')", (repo_id, repo_id),
        ).fetchone()
    return row[0] if row and row[0] else None


# ---- architecture ------------------------------------------------------------------------------
def _module_type(name: str, languages: Counter, frameworks: set[str]) -> str:
    lowered = name.lower().split("/")[-1]
    for kind, names in _TYPE_NAMES:
        if lowered in names:
            return kind
    total = sum(languages.values()) or 1
    if sum(c for lang, c in languages.items() if lang in _FRONTEND_LANGS) / total > 0.5:
        return "frontend"
    return "module"


def architecture_data(db: Database, repos: RepositoryService, repo_id: str) -> dict:
    repo = require_scanned(repos, repo_id)
    parsed = is_parsed(db, repo_id)
    with db.session() as conn:
        files = conn.execute(
            "SELECT path, language, is_entry_point FROM files WHERE repository_id=?", (repo_id,)
        ).fetchall()
        edges_raw = conn.execute(
            "SELECT path, resolved_path, COUNT(*) AS n FROM imports WHERE repository_id=? AND dep_type='internal'"
            " AND resolved_path IS NOT NULL GROUP BY path, resolved_path", (repo_id,)
        ).fetchall()
        packages = conn.execute(
            "SELECT package, COUNT(DISTINCT path) AS files FROM imports WHERE repository_id=? AND dep_type='external'"
            " AND package IS NOT NULL GROUP BY package ORDER BY files DESC, package LIMIT 40", (repo_id,)
        ).fetchall()
        class_rows = conn.execute(
            f"SELECT path, name FROM symbols WHERE repository_id=? AND kind IN ({','.join('?' * len(CLASS_KINDS))})"
            " ORDER BY path, start_line LIMIT 5000", (repo_id, *CLASS_KINDS),
        ).fetchall()
    top = Counter(f["path"].split("/")[0] for f in files if "/" in f["path"])
    split_root = None
    if files and top:
        name, count = top.most_common(1)[0]
        if name.lower() in MONOREPO_ROOTS and count / len(files) >= 0.6:
            split_root = name

    def module_of(path: str) -> str:
        parts = path.split("/")
        if len(parts) == 1:
            return "."
        if split_root and parts[0] == split_root and len(parts) > 2:
            return f"{parts[0]}/{parts[1]}"
        return parts[0]

    members: dict[str, list[str]] = {}
    languages: dict[str, Counter] = {}
    for f in files:
        module = module_of(f["path"])
        members.setdefault(module, []).append(f["path"])
        if f["language"]:
            languages.setdefault(module, Counter())[f["language"]] += 1
    classes: dict[str, list[str]] = {}
    for r in class_rows:
        names = classes.setdefault(module_of(r["path"]), [])
        if len(names) < 4:
            names.append(r["name"])

    frameworks = set(repo.frameworks)
    modules = []
    for module, paths in sorted(members.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        langs = languages.get(module, Counter())
        label = "(repository root)" if module == "." else module.split("/")[-1]
        main = ", ".join(f"{name} ({count})" for name, count in langs.most_common(3)) or "no source languages"
        description = f"{len(paths)} files. Languages: {main}."
        if classes.get(module):
            description += " Defines: " + ", ".join(classes[module]) + "."
        modules.append({
            "id": module, "path": module, "label": label, "type": _module_type(module, langs, frameworks),
            "subtitle": f"{len(paths)} files" + (f" · {langs.most_common(1)[0][0]}" if langs else ""),
            "description": description, "fileCount": len(paths), "languages": [n for n, _ in langs.most_common(5)],
            "files": sorted(paths)[:30],
        })
    edge_counts: Counter = Counter()
    for e in edges_raw:
        a, b = module_of(e["path"]), module_of(e["resolved_path"])
        if a != b:
            edge_counts[(a, b)] += e["n"]
    edges = [{"source": a, "target": b, "imports": n, "label": f"{n} import{'s' if n != 1 else ''}"}
             for (a, b), n in sorted(edge_counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    kinds = Counter(m["type"] for m in modules)
    return {
        "overview": {
            "totalModules": len(modules),
            "frontendComponents": sum(m["fileCount"] for m in modules if m["type"] == "frontend"),
            "backendServices": kinds["service"] + kinds["api"],
            "apiConnections": len(edges),
        },
        "modules": modules, "edges": edges,
        "externalPackages": [{"name": p["package"], "files": p["files"]} for p in packages],
        "entryPoints": sorted(f["path"] for f in files if f["is_entry_point"])[:30],
        "analysedAt": last_analysed(db, repo_id), "parsed": parsed, "typeNote": TYPE_NOTE,
        **({} if parsed else {"message": "The repository has not been parsed yet; module edges need code parsing."}),
    }


# ---- packages ----------------------------------------------------------------------------------
def _clean_version(spec) -> str:
    if isinstance(spec, dict):
        spec = spec.get("version", "*")
    return str(spec).strip() or "*"


def _req_lines(text: str, manifest: str, kind: str) -> list[dict]:
    out = []
    for line in text.splitlines():
        line = line.split("#")[0].strip()
        if not line or line.startswith(("-", "git+", "http")):
            continue
        m = re.match(r"([A-Za-z0-9][A-Za-z0-9._\-]*)(?:\[[^\]]*\])?\s*([<>=!~].*)?$", line.split(";")[0].strip())
        if m:
            out.append({"name": m.group(1), "version": (m.group(2) or "*").replace(" ", ""), "ecosystem": "PyPI", "type": kind})
    return out


def _parse_manifest(name: str, text: str) -> list[dict]:
    lowered = name.lower()
    out: list[dict] = []
    try:
        if lowered == "package.json":
            data = json.loads(text)
            for section, kind in (("dependencies", "production"), ("peerDependencies", "production"),
                                  ("optionalDependencies", "production"), ("devDependencies", "development")):
                for dep, version in (data.get(section) or {}).items():
                    out.append({"name": dep, "version": _clean_version(version), "ecosystem": "npm", "type": kind})
        elif re.match(r"requirements[\w.\-]*\.txt$", lowered):
            kind = "development" if re.search(r"dev|test|lint|doc", lowered) else "production"
            out += _req_lines(text, name, kind)
        elif lowered == "pyproject.toml":
            data = tomllib.loads(text)
            project = data.get("project") or {}
            out += _req_lines("\n".join(project.get("dependencies") or []), name, "production")
            for group, items in (project.get("optional-dependencies") or {}).items():
                kind = "development" if re.search(r"dev|test|lint|doc|typing", group, re.I) else "production"
                out += _req_lines("\n".join(items), name, kind)
            poetry = (data.get("tool") or {}).get("poetry") or {}
            for dep, spec in (poetry.get("dependencies") or {}).items():
                if dep.lower() != "python":
                    out.append({"name": dep, "version": _clean_version(spec), "ecosystem": "PyPI", "type": "production"})
            tables = [(poetry.get("dev-dependencies") or {})] + [g.get("dependencies") or {} for g in (poetry.get("group") or {}).values()]
            for table in tables:
                for dep, spec in table.items():
                    out.append({"name": dep, "version": _clean_version(spec), "ecosystem": "PyPI", "type": "development"})
        elif lowered == "cargo.toml":
            data = tomllib.loads(text)
            for section, kind in (("dependencies", "production"), ("build-dependencies", "production"), ("dev-dependencies", "development")):
                for dep, spec in (data.get(section) or {}).items():
                    out.append({"name": dep, "version": _clean_version(spec), "ecosystem": "Cargo", "type": kind})
        elif lowered == "go.mod":
            for m in re.finditer(r"^\s*(?:require\s+)?([\w.\-]+(?:/[\w.\-~]+)+)\s+(v[\w.\-+]+)", text, re.M):
                out.append({"name": m.group(1), "version": m.group(2), "ecosystem": "Go", "type": "production"})
        elif lowered == "composer.json":
            data = json.loads(text)
            for section, kind in (("require", "production"), ("require-dev", "development")):
                for dep, version in (data.get(section) or {}).items():
                    if dep != "php" and not dep.startswith("ext-"):
                        out.append({"name": dep, "version": _clean_version(version), "ecosystem": "Composer", "type": kind})
        elif lowered == "gemfile":
            kind = "production"
            for line in text.splitlines():
                stripped = line.strip()
                if re.match(r"group\s+.*(development|test)", stripped):
                    kind = "development"
                elif stripped == "end":
                    kind = "production"
                m = re.match(r"""gem\s+['"]([\w\-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?""", stripped)
                if m:
                    out.append({"name": m.group(1), "version": m.group(2) or "*", "ecosystem": "RubyGems", "type": kind})
        elif lowered.endswith((".csproj", ".fsproj", ".vbproj")):
            for m in re.finditer(r"""PackageReference\s+Include=["']([^"']+)["'](?:\s+Version=["']([^"']+)["'])?""", text):
                out.append({"name": m.group(1), "version": m.group(2) or "*", "ecosystem": "NuGet", "type": "production"})
        elif lowered == "pom.xml":
            for m in re.finditer(r"<dependency>\s*<groupId>([^<]+)</groupId>\s*<artifactId>([^<]+)</artifactId>(?:\s*<version>([^<]+)</version>)?(?:\s*<scope>([^<]+)</scope>)?", text):
                out.append({"name": f"{m.group(1)}:{m.group(2)}", "version": m.group(3) or "*", "ecosystem": "Maven",
                            "type": "development" if (m.group(4) or "") == "test" else "production"})
    except (ValueError, tomllib.TOMLDecodeError, AttributeError, TypeError):
        return []
    return out


def _matches(declared: str, ecosystem: str, package: str) -> bool:
    if ecosystem == "PyPI":
        alias = PY_IMPORT_ALIASES.get(package.lower())
        return _norm(declared) == _norm(package) or (alias is not None and _norm(alias) == _norm(declared))
    if ecosystem == "Cargo":
        return declared.replace("-", "_") == package.replace("-", "_")
    if ecosystem == "Go":
        return declared == package or declared.startswith(package + "/") or package.startswith(declared + "/")
    if ecosystem == "Maven":
        return declared.split(":")[0] == package
    return declared == package or declared.lower() == package.lower()


def packages_data(db: Database, repos: RepositoryService, reader: RepoReader, repo_id: str) -> list[dict]:
    require_scanned(repos, repo_id)
    with db.session() as conn:
        manifests = [r[0] for r in conn.execute(
            "SELECT path FROM files WHERE repository_id=? AND category='manifest' AND is_sensitive=0 ORDER BY path", (repo_id,))]
        imports = conn.execute(
            "SELECT package, path, kind, module FROM imports WHERE repository_id=? AND dep_type='external'"
            " AND package IS NOT NULL ORDER BY path, line", (repo_id,)
        ).fetchall()
    by_package: dict[str, list] = {}
    for row in imports:
        by_package.setdefault(row["package"], []).append(row)
    out: list[dict] = []
    seen: set[tuple] = set()
    for manifest in manifests:
        text = reader.read_text(manifest)
        if text is None:
            continue
        for dep in _parse_manifest(manifest.rsplit("/", 1)[-1], text):
            key = (dep["name"].lower(), dep["ecosystem"], manifest)
            if key in seen:
                continue
            seen.add(key)
            rows = [r for package, items in by_package.items() if _matches(dep["name"], dep["ecosystem"], package) for r in items]
            usage = "imported" if rows else ("tooling" if dep["type"] == "development" else "declared-only")
            out.append({
                **dep, "usage": usage, "manifest": manifest,
                "observedImports": [{"file": r["path"], "statement": f"{r['kind']} {r['module']}"} for r in rows[:5]],
                "relatedFiles": list(dict.fromkeys(r["path"] for r in rows))[:10],
            })
    out.sort(key=lambda d: (d["ecosystem"], d["name"].lower()))
    return out


# ---- single file view --------------------------------------------------------------------------
def file_view(db: Database, repos: RepositoryService, repo_id: str, rel: str, max_file_bytes: int) -> dict:
    repo = require_scanned(repos, repo_id)
    with db.session() as conn:
        row = conn.execute(
            "SELECT language, extension, is_sensitive, sha256, mtime_ns FROM files WHERE repository_id=? AND path=?", (repo_id, rel)
        ).fetchone()
    if row is None:
        raise ApiError(404, "file_not_in_inventory", "File not found in the scanned repository inventory.")
    if row["is_sensitive"]:
        raise ApiError(403, "sensitive_file", "This file is marked sensitive and its content is never returned.")
    root_real = os.path.realpath(repo.path)
    full = os.path.join(root_real, *rel.split("/"))
    try:
        info = os.lstat(full)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            raise ApiError(403, "not_a_regular_file", "Only regular files can be shown.")
        if info.st_size > max_file_bytes:
            raise ApiError(413, "file_too_large", "File is too large to display.")
        if os.path.commonpath([root_real, os.path.realpath(full)]) != root_real:
            raise ApiError(403, "outside_repository", "Path resolves outside the repository.")
        digest = hashlib.sha256()
        kept = b""
        newlines = 0
        last = b""
        with open(full, "rb") as handle:
            first = handle.read(8192)
            if b"\0" in first:
                raise ApiError(415, "binary_file", "Binary files cannot be displayed.")
            handle.seek(0)
            while True:
                chunk = handle.read(65536)
                if not chunk:
                    break
                digest.update(chunk)
                newlines += chunk.count(b"\n")
                last = chunk[-1:]
                if len(kept) < FILE_VIEW_CAP:
                    kept += chunk[: FILE_VIEW_CAP - len(kept)]
    except FileNotFoundError:
        raise ApiError(404, "file_missing", "The file no longer exists on disk (rescan the repository).") from None
    except PermissionError:
        raise ApiError(403, "permission_denied", "Permission denied while reading the file.") from None
    except OSError:
        raise ApiError(422, "unreadable", "The file could not be read.") from None

    with db.session() as conn:
        symbols = conn.execute(
            "SELECT name, kind, start_line, end_line, parent FROM symbols WHERE repository_id=? AND path=? ORDER BY start_line, id",
            (repo_id, rel),
        ).fetchall()
        imports = conn.execute(
            "SELECT module, line, dep_type, resolved_path FROM imports WHERE repository_id=? AND path=? ORDER BY line, id", (repo_id, rel)
        ).fetchall()
        importers = [r[0] for r in conn.execute(
            "SELECT DISTINCT path FROM imports WHERE repository_id=? AND resolved_path=? AND path!=? ORDER BY path LIMIT 50",
            (repo_id, rel, rel))]
    related = list(dict.fromkeys([r["resolved_path"] for r in imports if r["resolved_path"] and r["resolved_path"] != rel] + importers))[:20]
    return {
        "path": rel,
        "content": kept.decode("utf-8", "replace"),
        "sizeBytes": info.st_size,
        "lineCount": newlines + (1 if last and last != b"\n" else 0),
        "language": row["language"],
        "extension": row["extension"],
        "lastModified": datetime.fromtimestamp(info.st_mtime, timezone.utc).isoformat(timespec="seconds"),
        "encoding": "utf-8",
        "truncated": info.st_size > FILE_VIEW_CAP,
        "stale": row["sha256"] is not None and digest.hexdigest() != row["sha256"],
        "symbols": [{"name": s["name"], "kind": s["kind"], "startLine": s["start_line"], "endLine": s["end_line"],
                     "parent": s["parent"]} for s in symbols],
        "imports": [{"module": i["module"], "line": i["line"], "depType": i["dep_type"], "resolvedPath": i["resolved_path"]}
                    for i in imports],
        "relatedFiles": related,
        "importedBy": importers,
    }


# ---- folder suggestions ------------------------------------------------------------------------
_MARKERS = ["package.json", "pyproject.toml", "requirements.txt", "pom.xml", "go.mod", "Cargo.toml", "composer.json"]
_BASES = ["Desktop", "Documents", "source", "projects", "dev", "repos"]


def fs_suggestions(home: Path | None = None, limit: int = 30) -> list[dict]:
    """Likely project folders under the user's home. Only directory names are listed, never file contents."""
    home = home or Path.home()
    results: list[dict] = []
    seen: set[str] = set()
    for base in [home / name for name in _BASES] + [home]:
        try:
            children = sorted((e for e in os.scandir(base) if e.is_dir(follow_symlinks=False)), key=lambda e: e.name.lower())
        except OSError:
            continue
        for child in children:
            if child.name.startswith(".") or child.name.lower() in ("appdata", "node_modules"):
                continue
            key = os.path.normcase(os.path.realpath(child.path))
            if key in seen:
                continue
            try:
                names = {e.name for e in os.scandir(child.path)}
            except OSError:
                continue
            hint = None
            if ".git" in names:
                hint = "Git repository"
            else:
                marker = next((m for m in _MARKERS if m in names), None) or next(
                    (n for n in sorted(names) if n.endswith((".sln", ".csproj"))), None)
                if marker:
                    hint = f"Detected {marker}"
            if hint:
                seen.add(key)
                results.append({"name": child.name, "path": child.path, "hint": hint})
                if len(results) >= limit:
                    return results
    return results
