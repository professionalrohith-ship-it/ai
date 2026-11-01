"""Pure classification helpers: language, category and entry-point detection from a path alone."""
from __future__ import annotations

import re

EXT_LANGUAGE = {
    ".py": "Python", ".pyw": "Python", ".pyi": "Python",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
    ".java": "Java",
    ".c": "C", ".h": "C",
    ".cpp": "C++", ".cc": "C++", ".cxx": "C++", ".hpp": "C++", ".hh": "C++", ".hxx": "C++",
    ".cs": "C#",
    ".go": "Go",
    ".rs": "Rust",
    ".php": "PHP",
    ".rb": "Ruby", ".rake": "Ruby",
    ".html": "HTML", ".htm": "HTML",
    ".css": "CSS", ".scss": "SCSS",
    ".sql": "SQL",
    ".kt": "Kotlin", ".kts": "Kotlin",
    ".swift": "Swift",
    ".sh": "Shell", ".bash": "Shell",
    ".ps1": "PowerShell",
    ".vue": "Vue",
}
NAME_LANGUAGE = {"rakefile": "Ruby", "gemfile": "Ruby"}

MANIFEST_NAMES = {
    "package.json", "pyproject.toml", "setup.py", "pipfile", "pom.xml", "build.gradle",
    "build.gradle.kts", "settings.gradle", "go.mod", "cargo.toml", "composer.json", "gemfile",
    "packages.config", "cmakelists.txt",
    # lock files: kept in the inventory because they reveal the package manager
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "pipfile.lock",
    "cargo.lock", "composer.lock", "gemfile.lock", "go.sum", "uv.lock",
}
MANIFEST_RE = re.compile(r"^requirements[\w.\-]*\.txt$|\.(csproj|fsproj|vbproj)$", re.I)

CONFIG_NAMES = {
    "dockerfile", "makefile", "docker-compose.yml", "docker-compose.yaml", "compose.yml",
    "compose.yaml", ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore",
    ".prettierrc", ".babelrc", ".nvmrc", "tox.ini", "pytest.ini", "setup.cfg", "procfile",
    "vercel.json", "netlify.toml", "nginx.conf",
}
CONFIG_RE = re.compile(
    r"^(\.env(\..+)?|tsconfig[\w.\-]*\.json|\.eslintrc[\w.]*|eslint\.config\.\w+|vite\.config\.\w+|"
    r"webpack\.config\.\w+|next\.config\.\w+|nuxt\.config\.\w+|tailwind\.config\.\w+|"
    r"jest\.config\.\w+|vitest\.config\.\w+|babel\.config\.\w+|angular\.json|\.flake8|\.pylintrc)$",
    re.I,
)
CONFIG_EXT = {".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".properties", ".json", ".xml", ".env"}

DOC_EXT = {".md", ".mdx", ".rst", ".adoc"}
DOC_STEMS = {"readme", "license", "licence", "changelog", "contributing", "authors", "notice", "security"}
DOC_DIRS = {"docs", "doc", "documentation"}

TEST_DIRS = {"test", "tests", "__tests__", "spec", "specs", "e2e", "cypress", "testing"}
TEST_FILE_RE = re.compile(
    r"^(test_.+\.py|.+_test\.(py|go|rb|c|cc|cpp)|.+\.(test|spec)\.[cm]?[jt]sx?|.+_spec\.rb|"
    r"[A-Z]\w*Tests?\.(java|cs|kt)|.+Test\.php)$"
)

SENSITIVE_RE = re.compile(
    r"^(\.env(\..+)?|.+\.(pem|key|p12|pfx|jks|keystore|ppk)|id_(rsa|dsa|ecdsa|ed25519)|"
    r"credentials(\.json)?|secrets?\.(json|ya?ml|toml)|\.npmrc|\.pypirc|\.netrc|terraform\.tfvars|.+\.tfstate)$",
    re.I,
)
# Templates are meant to be committed and contain no real values.
SENSITIVE_SAFE_SUFFIXES = (".example", ".sample", ".template", ".dist")

ENTRY_NAMES_ANY_DEPTH = {
    "main.go", "main.rs", "program.cs", "main.java", "application.java", "__main__.py", "manage.py",
}
ENTRY_NAMES_NEAR_ROOT = {
    "main.py", "app.py", "run.py", "server.py", "wsgi.py", "asgi.py", "index.js", "index.jsx",
    "index.ts", "index.tsx", "main.js", "main.jsx", "main.ts", "main.tsx", "server.js", "server.ts",
    "app.js", "app.ts", "main.c", "main.cpp", "main.cc", "index.php", "config.ru", "index.html",
}
ENTRY_PARENT_DIRS = {"src", "app", "cmd", "server", "backend", "frontend", "client", "bin"}


def extension_of(name: str) -> str:
    dot = name.rfind(".")
    return name[dot:].lower() if dot > 0 else ""


def is_sensitive(name: str) -> bool:
    if name.lower().endswith(SENSITIVE_SAFE_SUFFIXES):
        return False
    return bool(SENSITIVE_RE.match(name))


def detect_language(name: str, ext: str) -> str | None:
    return EXT_LANGUAGE.get(ext) or NAME_LANGUAGE.get(name.lower())


def is_test_path(rel_path: str, name: str) -> bool:
    parts = rel_path.lower().split("/")[:-1]
    return any(p in TEST_DIRS for p in parts) or bool(TEST_FILE_RE.match(name))


def detect_category(rel_path: str, name: str, ext: str, language: str | None) -> str:
    lowered = name.lower()
    if ext not in DOC_EXT and (language or ext in CONFIG_EXT) and is_test_path(rel_path, name):
        return "test"
    if lowered in MANIFEST_NAMES or MANIFEST_RE.search(name):
        return "manifest"
    parts = rel_path.lower().split("/")[:-1]
    stem = lowered.split(".")[0]
    if ext in DOC_EXT or stem in DOC_STEMS or (any(p in DOC_DIRS for p in parts) and not language):
        return "doc"
    if lowered in CONFIG_NAMES or CONFIG_RE.match(name) or (not language and ext in CONFIG_EXT):
        return "config"
    return "source" if language else "other"


def is_entry_point(rel_path: str, name: str) -> bool:
    lowered = name.lower()
    if lowered in ENTRY_NAMES_ANY_DEPTH:
        return True
    if lowered not in ENTRY_NAMES_NEAR_ROOT:
        return False
    parts = rel_path.lower().split("/")[:-1]
    return (
        not parts
        or (len(parts) == 1 and parts[0] in ENTRY_PARENT_DIRS)
        or (len(parts) == 2 and parts[1] in ENTRY_PARENT_DIRS)
    )
