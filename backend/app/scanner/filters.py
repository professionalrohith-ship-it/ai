"""What the scanner leaves out: build output, dependencies, binaries, generated files, .gitignore matches."""
from __future__ import annotations

import os
from pathlib import Path

import pathspec

EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "bower_components", "vendor", "__pycache__",
    ".venv", "venv", "env", "site-packages", ".eggs", ".tox", ".nox", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", ".hypothesis", ".cache", ".parcel-cache", ".turbo",
    "build", "dist", "out", ".next", ".nuxt", ".svelte-kit", ".angular", ".gradle", ".dart_tool",
    "coverage", "htmlcov", ".nyc_output", ".idea", ".terraform", "pods", "tmp", "temp", ".tmp",
}
# Only build output when the matching build system sits next to them.
CONDITIONAL_DIRS = {
    "target": ("cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts"),
    "bin": (".csproj", ".fsproj", ".vbproj"),
    "obj": (".csproj", ".fsproj", ".vbproj"),
}

BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".tiff", ".psd", ".svgz",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war", ".ear", ".whl",
    ".exe", ".dll", ".so", ".dylib", ".a", ".lib", ".o", ".obj", ".pdb", ".class", ".pyc", ".pyo",
    ".pyd", ".bin", ".dat", ".db", ".sqlite", ".sqlite3", ".mdb",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp3", ".mp4", ".mov", ".avi", ".wav", ".flac", ".mkv", ".webm",
    ".pkl", ".npy", ".npz", ".h5", ".onnx", ".pt", ".pth", ".safetensors", ".gguf", ".ckpt",
}
GENERATED_SUFFIXES = (".min.js", ".min.css", ".map", ".bundle.js", ".chunk.js")
TEMP_SUFFIXES = (".tmp", ".temp", ".swp", ".swo", ".bak", ".orig", ".rej", ".log", "~")
TEMP_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}


def excluded_file_reason(name: str, ext: str) -> str | None:
    lowered = name.lower()
    if lowered in TEMP_NAMES or lowered.endswith(TEMP_SUFFIXES):
        return "temporary"
    if lowered.endswith(GENERATED_SUFFIXES):
        return "generated"
    if ext in BINARY_EXT:
        return "binary"
    return None


def excluded_dir_reason(name: str, abs_path: str, sibling_names: set[str]) -> str | None:
    lowered = name.lower()
    if lowered in EXCLUDED_DIRS or lowered.endswith(".egg-info"):
        return "excluded_dir"
    markers = CONDITIONAL_DIRS.get(lowered)
    if markers and any(s == m or s.endswith(m) for s in sibling_names for m in markers):
        return "build_output"
    if os.path.isfile(os.path.join(abs_path, "pyvenv.cfg")):
        return "virtualenv"
    return None


def looks_binary(chunk: bytes) -> bool:
    return b"\0" in chunk


def compile_patterns(lines: list[str]) -> pathspec.GitIgnoreSpec:
    return pathspec.GitIgnoreSpec.from_lines(lines)


def load_gitignore(directory: Path, max_bytes: int) -> pathspec.GitIgnoreSpec | None:
    target = directory / ".gitignore"
    try:
        if target.is_symlink() or not target.is_file() or target.stat().st_size > max_bytes:
            return None
        text = target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    lines = text.splitlines()
    return compile_patterns(lines) if lines else None


def is_ignored(rel_path: str, is_dir: bool, specs: tuple[tuple[str, pathspec.GitIgnoreSpec], ...]) -> bool:
    """specs hold (directory prefix, spec) pairs: each .gitignore applies relative to its own directory."""
    for prefix, spec in specs:
        sub = rel_path[len(prefix):]
        if spec.match_file(sub + "/" if is_dir else sub):
            return True
    return False
