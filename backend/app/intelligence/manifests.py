"""Declared dependencies read from manifests, used only to classify imports (data parsing, nothing executed)."""
from __future__ import annotations

import json
import os
import posixpath
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from ..scanner.frameworks import _norm, _python_deps


@dataclass
class Declared:
    npm: set[str] = field(default_factory=set)
    npm_workspaces: dict[str, str] = field(default_factory=dict)  # package.json "name" -> manifest path
    python: set[str] = field(default_factory=set)
    cargo: set[str] = field(default_factory=set)
    cargo_packages: dict[str, str] = field(default_factory=dict)  # crate name -> Cargo.toml path
    composer: set[str] = field(default_factory=set)
    psr4: list[tuple[str, str]] = field(default_factory=list)  # (namespace prefix with dots, directory)
    gems: set[str] = field(default_factory=set)
    maven_groups: set[str] = field(default_factory=set)
    nuget: set[str] = field(default_factory=set)
    go_modules: list[tuple[str, str]] = field(default_factory=list)  # (directory, module path)
    ts_configs: list[tuple[str, str | None, dict[str, list[str]]]] = field(default_factory=list)  # (dir, baseUrl, paths)


def _safe_read(root: Path, rel: str, limit: int) -> str | None:
    target = root / rel
    try:
        if target.is_symlink() or not target.is_file() or target.stat().st_size > limit:
            return None
        resolved = target.resolve()
        if os.path.commonpath([str(root.resolve()), str(resolved)]) != str(root.resolve()):
            return None
        return target.read_text(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        return None


def _strip_jsonc(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|[^:\"'])//.*$", r"\1", text, flags=re.M)
    return re.sub(r",(\s*[}\]])", r"\1", text)


def load_declared(root: Path, paths: list[str], limit: int = 1024 * 1024) -> Declared:
    declared = Declared()
    for rel in paths:
        name = posixpath.basename(rel).lower()
        directory = posixpath.dirname(rel)
        text = _safe_read(root, rel, limit)
        if text is None:
            continue
        try:
            if name == "package.json":
                data = json.loads(text)
                if isinstance(data, dict):
                    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                        if isinstance(data.get(section), dict):
                            declared.npm.update(data[section])
                    if isinstance(data.get("name"), str):
                        declared.npm_workspaces.setdefault(data["name"], rel)
            elif name in ("tsconfig.json", "jsconfig.json"):
                options = (json.loads(_strip_jsonc(text)).get("compilerOptions") or {})
                paths_map = {k: [v for v in vs if isinstance(v, str)] for k, vs in (options.get("paths") or {}).items() if isinstance(vs, list)}
                declared.ts_configs.append((directory, options.get("baseUrl"), paths_map))
            elif name.endswith(".txt") or name in ("pyproject.toml", "pipfile"):
                declared.python.update(_python_deps(rel, text))
            elif name == "cargo.toml":
                data = tomllib.loads(text)
                for table in ("dependencies", "dev-dependencies", "build-dependencies"):
                    declared.cargo.update(_norm(d).replace("-", "_") for d in (data.get(table) or {}))
                package = (data.get("package") or {}).get("name")
                if package:
                    declared.cargo_packages.setdefault(package.replace("-", "_"), rel)
            elif name == "composer.json":
                data = json.loads(text)
                for section in ("require", "require-dev"):
                    declared.composer.update((data.get(section) or {}).keys())
                for section in ("autoload", "autoload-dev"):
                    for prefix, target in ((data.get(section) or {}).get("psr-4") or {}).items():
                        for item in target if isinstance(target, list) else [target]:
                            declared.psr4.append((prefix.rstrip("\\").replace("\\", "."), posixpath.normpath(posixpath.join(directory, item))))
            elif name == "gemfile":
                declared.gems.update(re.findall(r"""^\s*gem\s+['"]([\w\-]+)['"]""", text, re.M))
            elif name in ("pom.xml", "build.gradle", "build.gradle.kts"):
                declared.maven_groups.update(re.findall(r"<groupId>([^<$]+)</groupId>", text))
                declared.maven_groups.update(re.findall(r"""['"]([A-Za-z][\w.\-]*):[\w.\-]+(?::[^'"]+)?['"]""", text))
            elif name.endswith((".csproj", ".fsproj", ".vbproj")):
                declared.nuget.update(re.findall(r"""PackageReference\s+Include=["']([^"']+)["']""", text))
            elif name == "go.mod":
                match = re.search(r"^module\s+(\S+)", text, re.M)
                if match:
                    declared.go_modules.append((directory, match.group(1)))
        except (ValueError, tomllib.TOMLDecodeError, AttributeError, TypeError):
            continue  # malformed manifest: skip it, classification just gets less certain
    declared.python = {_norm(p) for p in declared.python}
    return declared
