"""Framework / package-manager detection from manifests and marker files.
Manifests are parsed as data (json / tomllib / regex); nothing from the repository is executed."""
from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

from ..config import Settings
from .walker import ScanOutcome


@dataclass(frozen=True)
class Tech:
    name: str
    category: str  # language | frontend-framework | backend-framework | database | dev-tool | configuration | package-manager
    source: str
    confidence: str = "high"
    version: str | None = None


FE, BE, DB, DEV = "frontend-framework", "backend-framework", "database", "dev-tool"

NPM = {
    "react": ("React", FE), "next": ("Next.js", FE), "vue": ("Vue", FE), "nuxt": ("Nuxt", FE),
    "@angular/core": ("Angular", FE), "svelte": ("Svelte", FE), "solid-js": ("SolidJS", FE),
    "express": ("Express", BE), "fastify": ("Fastify", BE), "@nestjs/core": ("NestJS", BE),
    "koa": ("Koa", BE), "electron": ("Electron", FE),
    "vite": ("Vite", DEV), "webpack": ("Webpack", DEV), "tailwindcss": ("Tailwind CSS", DEV),
    "typescript": ("TypeScript", DEV), "jest": ("Jest", DEV), "vitest": ("Vitest", DEV),
    "mocha": ("Mocha", DEV), "eslint": ("ESLint", DEV), "redux": ("Redux", FE),
    "@reduxjs/toolkit": ("Redux Toolkit", FE), "prisma": ("Prisma", DB), "mongoose": ("MongoDB", DB),
    "pg": ("PostgreSQL", DB), "mysql2": ("MySQL", DB), "sqlite3": ("SQLite", DB),
}
PYTHON = {
    "django": ("Django", BE), "flask": ("Flask", BE), "fastapi": ("FastAPI", BE),
    "starlette": ("Starlette", BE), "tornado": ("Tornado", BE), "aiohttp": ("aiohttp", BE),
    "pytest": ("pytest", DEV), "sqlalchemy": ("SQLAlchemy", DB), "psycopg2": ("PostgreSQL", DB),
    "psycopg": ("PostgreSQL", DB), "pymongo": ("MongoDB", DB), "redis": ("Redis", DB),
    "celery": ("Celery", BE), "numpy": ("NumPy", DEV), "pandas": ("pandas", DEV),
    "torch": ("PyTorch", DEV), "tensorflow": ("TensorFlow", DEV), "streamlit": ("Streamlit", FE),
    "pydantic": ("Pydantic", DEV), "black": ("Black", DEV), "ruff": ("Ruff", DEV),
}
CARGO = {"actix-web": ("Actix Web", BE), "axum": ("Axum", BE), "rocket": ("Rocket", BE),
         "tokio": ("Tokio", DEV), "serde": ("Serde", DEV), "diesel": ("Diesel", DB), "sqlx": ("SQLx", DB)}
GO = {"github.com/gin-gonic/gin": ("Gin", BE), "github.com/labstack/echo": ("Echo", BE),
      "github.com/gofiber/fiber": ("Fiber", BE), "github.com/gorilla/mux": ("Gorilla Mux", BE),
      "gorm.io/gorm": ("GORM", DB), "github.com/stretchr/testify": ("Testify", DEV)}
COMPOSER = {"laravel/framework": ("Laravel", BE), "symfony/framework-bundle": ("Symfony", BE),
            "phpunit/phpunit": ("PHPUnit", DEV), "slim/slim": ("Slim", BE)}
GEMS = {"rails": ("Ruby on Rails", BE), "sinatra": ("Sinatra", BE), "rspec": ("RSpec", DEV),
        "rspec-rails": ("RSpec", DEV), "pg": ("PostgreSQL", DB), "sidekiq": ("Sidekiq", BE)}
# Java / Kotlin / C# manifests are XML or Gradle DSL: matched as text.
TEXT_RULES = {
    "pom.xml": [("spring-boot", "Spring Boot", BE), ("junit", "JUnit", DEV), ("hibernate", "Hibernate", DB),
                ("quarkus", "Quarkus", BE), ("micronaut", "Micronaut", BE)],
    "build.gradle": [("spring-boot", "Spring Boot", BE), ("junit", "JUnit", DEV), ("hibernate", "Hibernate", DB),
                     ("ktor", "Ktor", BE), ("quarkus", "Quarkus", BE)],
    "build.gradle.kts": [("spring-boot", "Spring Boot", BE), ("junit", "JUnit", DEV), ("ktor", "Ktor", BE)],
    ".csproj": [("Microsoft.NET.Sdk.Web", "ASP.NET Core", BE), ("Microsoft.AspNetCore", "ASP.NET Core", BE),
                ("Microsoft.EntityFrameworkCore", "Entity Framework", DB), ("xunit", "xUnit", DEV),
                ("NUnit", "NUnit", DEV), ("Blazor", "Blazor", FE)],
}

PACKAGE_MANAGERS = [  # (marker file name, display name)
    ("package-lock.json", "npm"), ("yarn.lock", "Yarn"), ("pnpm-lock.yaml", "pnpm"),
    ("poetry.lock", "Poetry"), ("pipfile", "Pipenv"), ("uv.lock", "uv"),
    ("pom.xml", "Maven"), ("build.gradle", "Gradle"), ("build.gradle.kts", "Gradle"),
    ("cargo.toml", "Cargo"), ("go.mod", "Go modules"), ("composer.json", "Composer"),
    ("gemfile", "Bundler"),
]
MARKERS = [  # (lower-case file name, technology, category)
    ("dockerfile", "Docker", DEV), ("docker-compose.yml", "Docker Compose", DEV),
    ("docker-compose.yaml", "Docker Compose", DEV), ("compose.yaml", "Docker Compose", DEV),
    ("makefile", "Make", DEV), ("cmakelists.txt", "CMake", DEV), ("manage.py", "Django", BE),
    ("angular.json", "Angular", FE), ("tsconfig.json", "TypeScript", DEV),
    ("go.mod", "Go", "language"), ("cargo.toml", "Rust", "language"),
]
MARKER_PREFIXES = [("vite.config.", "Vite", DEV), ("next.config.", "Next.js", FE),
                   ("tailwind.config.", "Tailwind CSS", DEV), ("webpack.config.", "Webpack", DEV),
                   ("jest.config.", "Jest", DEV), ("vitest.config.", "Vitest", DEV)]

REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._\-]*)(?:\[[^\]]*\])?\s*(?:([<>=!~]=?[^;#\s,]*))?")


def _read_text(path: Path, limit: int) -> str | None:
    try:
        if path.is_symlink() or path.stat().st_size > limit:
            return None
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _clean_version(spec: str | None) -> str | None:
    if not spec:
        return None
    cleaned = spec.strip().lstrip("^~=<>! ")
    return cleaned[:40] or None


def _python_deps(manifest: str, text: str) -> dict[str, str | None]:
    deps: dict[str, str | None] = {}
    name = manifest.rsplit("/", 1)[-1].lower()
    if name.endswith(".txt"):
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith(("#", "-")):
                m = REQ_NAME.match(line)
                if m:
                    deps[_norm(m.group(1))] = _clean_version(m.group(2))
    elif name == "pyproject.toml":
        try:
            data = tomllib.loads(text)
        except tomllib.TOMLDecodeError:
            return deps
        for item in data.get("project", {}).get("dependencies", []) or []:
            m = REQ_NAME.match(item)
            if m:
                deps[_norm(m.group(1))] = _clean_version(m.group(2))
        for group in (data.get("project", {}).get("optional-dependencies", {}) or {}).values():
            for item in group:
                m = REQ_NAME.match(item)
                if m:
                    deps.setdefault(_norm(m.group(1)), _clean_version(m.group(2)))
        poetry = data.get("tool", {}).get("poetry", {})
        for table in (poetry.get("dependencies", {}), poetry.get("dev-dependencies", {}),
                      *[g.get("dependencies", {}) for g in poetry.get("group", {}).values()]):
            for dep, spec in table.items():
                version = spec if isinstance(spec, str) else (spec or {}).get("version") if isinstance(spec, dict) else None
                deps[_norm(dep)] = _clean_version(version)
    elif name == "pipfile":
        try:
            data = tomllib.loads(text)
        except tomllib.TOMLDecodeError:
            return deps
        for table in (data.get("packages", {}), data.get("dev-packages", {})):
            for dep, spec in table.items():
                deps[_norm(dep)] = _clean_version(spec if isinstance(spec, str) and spec != "*" else None)
    return deps


def detect(root: Path, outcome: ScanOutcome, settings: Settings) -> tuple[list[Tech], list[str]]:
    """Returns (technologies, package manager names). Languages themselves come from the file inventory."""
    found: dict[tuple[str, str], Tech] = {}
    managers: list[str] = []
    entry_points: list[str] = []

    def add(tech: Tech) -> None:
        found.setdefault((tech.name, tech.category), tech)

    def lookup(table: dict, dep: str, version: str | None, source: str) -> None:
        hit = table.get(dep)
        if hit:
            add(Tech(hit[0], hit[1], source, "high", _clean_version(version)))

    names = outcome.names_seen
    for lock, manager in PACKAGE_MANAGERS:
        if lock in names and manager not in managers:
            managers.append(manager)
    if "package.json" in names and not {"yarn", "pnpm"} & {m.lower() for m in managers} and "npm" not in managers:
        managers.append("npm")
    if any(n.startswith("requirements") and n.endswith(".txt") for n in names) and "poetry" not in {m.lower() for m in managers}:
        managers.append("pip")
    if "pyproject.toml" in names and not {"Poetry", "pip", "Pipenv", "uv"} & set(managers):
        managers.append("pip")
    if any(n.endswith((".csproj", ".fsproj", ".vbproj")) for n in names):
        managers.append("NuGet")

    for manifest in outcome.manifests:
        name = manifest.rsplit("/", 1)[-1]
        lowered = name.lower()
        path = root / manifest
        text = _read_text(path, settings.max_parse_bytes)
        if text is None:
            continue
        if lowered == "package.json":
            try:
                data = json.loads(text)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            for section in ("dependencies", "devDependencies", "peerDependencies"):
                deps = data.get(section)
                if isinstance(deps, dict):
                    for dep, version in deps.items():
                        lookup(NPM, dep, version if isinstance(version, str) else None, manifest)
            main = data.get("main")
            if isinstance(main, str) and "/.." not in "/" + main:
                entry_points.append(((manifest.rsplit("/", 1)[0] + "/") if "/" in manifest else "") + main.lstrip("./"))
            bins = data.get("bin")
            for target in ([bins] if isinstance(bins, str) else list((bins or {}).values()) if isinstance(bins, dict) else []):
                if isinstance(target, str) and ".." not in target:
                    entry_points.append(((manifest.rsplit("/", 1)[0] + "/") if "/" in manifest else "") + target.lstrip("./"))
        elif lowered.endswith(".txt") or lowered in ("pyproject.toml", "pipfile"):
            for dep, version in _python_deps(manifest, text).items():
                lookup(PYTHON, dep, version, manifest)
        elif lowered == "cargo.toml":
            try:
                data = tomllib.loads(text)
            except tomllib.TOMLDecodeError:
                continue
            for table in (data.get("dependencies", {}), data.get("dev-dependencies", {})):
                for dep, spec in table.items():
                    version = spec if isinstance(spec, str) else spec.get("version") if isinstance(spec, dict) else None
                    lookup(CARGO, dep, version, manifest)
        elif lowered == "go.mod":
            for line in text.splitlines():
                parts = line.replace("require", "", 1).split()
                if len(parts) >= 2 and "/" in parts[0]:
                    for prefix, hit in GO.items():
                        if parts[0].startswith(prefix):
                            add(Tech(hit[0], hit[1], manifest, "high", _clean_version(parts[1])))
        elif lowered == "composer.json":
            try:
                data = json.loads(text)
            except ValueError:
                continue
            for section in ("require", "require-dev"):
                deps = data.get(section) if isinstance(data, dict) else None
                if isinstance(deps, dict):
                    for dep, version in deps.items():
                        lookup(COMPOSER, dep, version if isinstance(version, str) else None, manifest)
        elif lowered == "gemfile":
            for match in re.finditer(r"""^\s*gem\s+['"]([\w\-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?""", text, re.M):
                lookup(GEMS, match.group(1), match.group(2), manifest)
        else:
            key = lowered if lowered in TEXT_RULES else next((k for k in TEXT_RULES if lowered.endswith(k)), None)
            for needle, display, category in TEXT_RULES.get(key or "", []):
                if needle.lower() in text.lower():
                    add(Tech(display, category, manifest, "medium"))

    for marker, display, category in MARKERS:
        if marker in names:
            add(Tech(display, category, marker, "medium" if category != "language" else "high"))
    for prefix, display, category in MARKER_PREFIXES:
        if any(n.startswith(prefix) for n in names):
            add(Tech(display, category, prefix + "*", "medium"))
    if ".github/workflows" in outcome.dir_files:
        add(Tech("GitHub Actions", DEV, ".github/workflows", "high"))

    for manager in managers:
        add(Tech(manager, "package-manager", "manifest", "high"))
    return list(found.values()), entry_points
