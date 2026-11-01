"""Import classification: internal / external / stdlib / unresolved.

This is static, best-effort resolution from the repository's own files and manifests. It does not run
package managers, read virtualenvs/node_modules, or follow build-system path configuration beyond
tsconfig "paths", Cargo/go.mod/composer metadata. Anything it cannot place is reported as `unresolved`
with a note, never guessed."""
from __future__ import annotations

import posixpath
import re
import sys
from dataclasses import dataclass, field

from .manifests import Declared

INTERNAL, EXTERNAL, STDLIB, UNRESOLVED = "internal", "external", "stdlib", "unresolved"

PY_IMPORT_ALIASES = {
    "yaml": "pyyaml", "pil": "pillow", "cv2": "opencv-python", "sklearn": "scikit-learn", "bs4": "beautifulsoup4",
    "dateutil": "python-dateutil", "jwt": "pyjwt", "dotenv": "python-dotenv", "attr": "attrs", "git": "gitpython",
    "mysqldb": "mysqlclient", "crypto": "pycryptodome", "serial": "pyserial", "jose": "python-jose",
    "magic": "python-magic", "openssl": "pyopenssl", "skimage": "scikit-image",
}
NODE_BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram",
    "diagnostics_channel", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder",
    "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
}
JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json", ".vue")
JS_SWAP = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}
C_STD_HEADERS = set(
    "assert.h complex.h ctype.h errno.h fenv.h float.h inttypes.h iso646.h limits.h locale.h math.h setjmp.h signal.h "
    "stdalign.h stdarg.h stdatomic.h stdbool.h stddef.h stdint.h stdio.h stdlib.h stdnoreturn.h string.h tgmath.h "
    "threads.h time.h uchar.h wchar.h wctype.h unistd.h fcntl.h pthread.h dirent.h netdb.h poll.h windows.h "
    "sys/types.h sys/stat.h sys/socket.h sys/time.h sys/wait.h sys/mman.h netinet/in.h arpa/inet.h".split()
)
CPP_STD_HEADERS = set(
    "algorithm any array atomic bitset cassert cctype cerrno chrono climits cmath complex condition_variable "
    "cstdarg cstddef cstdint cstdio cstdlib cstring ctime deque exception filesystem fstream functional future "
    "initializer_list iomanip ios iosfwd iostream istream iterator limits list locale map memory memory_resource "
    "mutex new numeric optional ostream queue random ranges regex set shared_mutex sstream stack stdexcept streambuf "
    "string string_view system_error thread tuple type_traits typeindex typeinfo unordered_map unordered_set utility "
    "valarray variant vector".split()
)
RUBY_STDLIB = set(
    "json set date time fileutils pathname tempfile securerandom digest openssl net/http uri yaml csv erb logger "
    "optparse ostruct stringio strscan timeout benchmark bigdecimal forwardable singleton observer open3 socket "
    "thread zlib base64 english etc find io/console monitor pp prettyprint psych rbconfig ripper shellwords tsort "
    "weakref".split()
)


@dataclass
class RepoIndex:
    paths: set[str]
    declared: Declared
    type_names: dict[str, str] = field(default_factory=dict)  # qualified type name -> file path (Java/C#/PHP)
    namespaces: dict[str, str] = field(default_factory=dict)  # namespace -> file path
    _basenames: dict[str, list[str]] | None = None

    def basenames(self) -> dict[str, list[str]]:
        if self._basenames is None:
            index: dict[str, list[str]] = {}
            for p in self.paths:
                index.setdefault(posixpath.basename(p), []).append(p)
            self._basenames = index
        return self._basenames

    def first_existing(self, candidates) -> str | None:
        return next((c for c in candidates if c in self.paths), None)


Result = tuple[str, str | None, str | None, str | None]  # dep_type, resolved_path, package, note


def _ancestors(directory: str) -> list[str]:
    """directory, its parents, ... and "" (the repository root)."""
    out = []
    while True:
        out.append(directory)
        if not directory:
            return out
        directory = posixpath.dirname(directory)


def _join(*parts: str) -> str:
    return posixpath.normpath(posixpath.join(*parts)) if any(parts) else ""


# ---- Python ------------------------------------------------------------------------------------
def _python_module_file(idx: RepoIndex, base: str, dotted: list[str]) -> str | None:
    rel = posixpath.join(base, *dotted) if dotted else base
    rel = posixpath.normpath(rel) if rel else ""
    return idx.first_existing([f"{rel}.py" if rel else "", posixpath.join(rel, "__init__.py") if rel else "__init__.py"])


def _prefer_submodule(idx: RepoIndex, base: str, dotted: list[str], names: list[str]) -> str | None:
    """Module file for `dotted` under `base`. For `from pkg import name` the dependency is on pkg/name.py when that
    submodule exists (pkg/__init__.py is only the fallback). Absolute imports use the longest existing prefix."""
    package = _python_module_file(idx, base, dotted) if dotted else idx.first_existing([posixpath.join(base, "__init__.py") if base else "__init__.py"])
    is_package = package is not None and package.endswith("__init__.py")
    if (is_package or not dotted) and names:
        for name in names:
            sub = _python_module_file(idx, base, [*dotted, name])
            if sub and sub != package:
                return sub
    if package:
        return package
    if names:  # namespace package (folder without __init__.py): `from pkg.sub import name` -> pkg/sub/name.py
        for name in names:
            sub = _python_module_file(idx, base, [*dotted, name])
            if sub:
                return sub
    for length in range(len(dotted) - 1, 0, -1):  # `import a.b.c` where only a/b.py exists
        found = _python_module_file(idx, base, dotted[:length])
        if found:
            return found
    return None


def resolve_python(idx: RepoIndex, importer: str, module: str, names: list[str], level: int) -> Result:
    directory = posixpath.dirname(importer)
    if level:
        base = directory
        for _ in range(level - 1):
            if not base:
                return UNRESOLVED, None, None, "relative import goes above the repository root"
            base = posixpath.dirname(base)
        dotted = [p for p in module.lstrip(".").split(".") if p]
        found = _prefer_submodule(idx, base, dotted, names)
        return (INTERNAL, found, None, None) if found else (UNRESOLVED, None, None, "relative module not found in repository")

    parts = module.split(".")
    if parts[0] in sys.stdlib_module_names:
        return STDLIB, None, None, None
    for root in _ancestors(directory):  # every ancestor can be a source root (src/, backend/, monorepo packages)
        for base in dict.fromkeys([root, posixpath.join(root, "src"), posixpath.join(root, "lib")]):
            found = _prefer_submodule(idx, base, parts, names)
            if found:
                return INTERNAL, found, None, None
    top = parts[0].lower().replace("_", "-")
    if top in idx.declared.python or PY_IMPORT_ALIASES.get(parts[0].lower()) in idx.declared.python:
        return EXTERNAL, None, parts[0], None
    return UNRESOLVED, None, None, "not in the repository, the standard library or declared dependencies"


# ---- JavaScript / TypeScript -------------------------------------------------------------------
def _js_candidates(base: str) -> list[str]:
    cands = [base]
    ext = posixpath.splitext(base)[1]
    stem = base[: -len(ext)] if ext else base
    for swapped in JS_SWAP.get(ext, ()):
        cands.append(stem + swapped)
    cands += [base + e for e in JS_EXTS]
    cands += [posixpath.join(base, "index" + e) for e in JS_EXTS]
    return cands


def _js_package(spec: str) -> str:
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") and len(parts) > 1 else parts[0]


def resolve_js(idx: RepoIndex, importer: str, spec: str) -> Result:
    if spec.startswith("node:") or spec.split("/")[0] in NODE_BUILTINS:
        return STDLIB, None, None, None
    directory = posixpath.dirname(importer)
    if spec.startswith("."):
        found = idx.first_existing(_js_candidates(_join(directory, spec)))
        return (INTERNAL, found, None, None) if found else (UNRESOLVED, None, None, "relative file not found in repository")
    for cfg_dir, base_url, paths in idx.declared.ts_configs:
        if cfg_dir and not (importer == cfg_dir or importer.startswith(cfg_dir + "/")):
            continue
        for pattern, targets in paths.items():
            star = pattern.find("*")
            matched = spec == pattern if star < 0 else spec.startswith(pattern[:star]) and spec.endswith(pattern[star + 1:])
            if not matched:
                continue
            tail = "" if star < 0 else spec[len(pattern[:star]) : len(spec) - len(pattern[star + 1:])]
            for target in targets:
                path = target.replace("*", tail, 1)
                found = idx.first_existing(_js_candidates(_join(cfg_dir, base_url or "", path)))
                if found:
                    return INTERNAL, found, None, "via tsconfig paths"
        if base_url is not None:
            found = idx.first_existing(_js_candidates(_join(cfg_dir, base_url, spec)))
            if found:
                return INTERNAL, found, None, "via tsconfig baseUrl"
    pkg = _js_package(spec)
    if pkg in idx.declared.npm_workspaces:
        return INTERNAL, idx.declared.npm_workspaces[pkg], None, "workspace package"
    if pkg in idx.declared.npm or ("@types/" + pkg.replace("@", "").replace("/", "__")) in idx.declared.npm:
        return EXTERNAL, None, pkg, None
    return UNRESOLVED, None, None, "bare specifier not declared in any package.json"


# ---- Java / C# / PHP (namespace based) ---------------------------------------------------------
def resolve_java(idx: RepoIndex, module: str, names: list[str]) -> Result:
    if module.startswith(("java.", "javax.", "jdk.", "sun.", "com.sun.")):
        return STDLIB, None, None, None
    parts = module.split(".")
    for length in range(len(parts), 0, -1):  # also resolves nested classes and static members
        found = idx.type_names.get(".".join(parts[:length]))
        if found:
            return INTERNAL, found, None, None
    if "*" in names:
        prefix = module + "."
        match = next(((q, p) for q, p in idx.type_names.items() if q.startswith(prefix)), None)
        if match:
            return INTERNAL, match[1], None, "package wildcard"
    for group in idx.declared.maven_groups:
        if module == group or module.startswith(group + "."):
            return EXTERNAL, None, group, None
    return UNRESOLVED, None, None, "not in the repository or declared Maven/Gradle groups"


def resolve_csharp(idx: RepoIndex, module: str) -> Result:
    if module == "System" or module.startswith("System."):
        return STDLIB, None, None, None
    if module in idx.namespaces or any(ns.startswith(module + ".") for ns in idx.namespaces):
        return INTERNAL, idx.namespaces.get(module) or next((p for ns, p in idx.namespaces.items() if ns.startswith(module + ".")), None), None, None
    found = idx.type_names.get(module)
    if found:
        return INTERNAL, found, None, None
    for package in idx.declared.nuget:
        if module == package or module.startswith(package + "."):
            return EXTERNAL, None, package, None
    return UNRESOLVED, None, None, "namespace not declared in the repository or in PackageReference entries"


def resolve_php(idx: RepoIndex, importer: str, module: str, kind: str) -> Result:
    if kind in ("require", "include"):
        found = idx.first_existing([_join(posixpath.dirname(importer), module), module])
        return (INTERNAL, found, None, None) if found else (UNRESOLVED, None, None, "included file not found (dynamic paths are not evaluated)")
    dotted = module.replace("\\", ".")
    found = idx.type_names.get(dotted)
    if found:
        return INTERNAL, found, None, None
    for prefix, directory in idx.declared.psr4:
        if dotted == prefix or dotted.startswith(prefix + "."):
            candidate = _join(directory, dotted[len(prefix) :].lstrip(".").replace(".", "/") + ".php")
            if candidate in idx.paths:
                return INTERNAL, candidate, None, "via composer psr-4"
    vendors = {p.split("/")[0].lower() for p in idx.declared.composer}
    if dotted.split(".")[0].lower() in vendors:
        return EXTERNAL, None, dotted.split(".")[0], "matched by composer vendor name"
    if "." not in dotted:
        return STDLIB, None, None, "global-namespace class (PHP core or extension, not verified)"
    return UNRESOLVED, None, None, "namespace not found in the repository or composer requirements"


# ---- Go / Rust / Ruby / C ----------------------------------------------------------------------
def resolve_go(idx: RepoIndex, importer: str, module: str) -> Result:
    for directory, mod_path in sorted(idx.declared.go_modules, key=lambda m: -len(m[1])):
        if module == mod_path or module.startswith(mod_path + "/"):
            rel = _join(directory, module[len(mod_path) :].lstrip("/"))
            prefix = rel + "/" if rel else ""
            found = next((p for p in sorted(idx.paths) if p.startswith(prefix) and p.endswith(".go") and "/" not in p[len(prefix):]), None)
            return INTERNAL, found, None, None
    if "." not in module.split("/")[0]:
        return STDLIB, None, None, None
    parts = module.split("/")
    return EXTERNAL, None, "/".join(parts[:3]) if parts[0] in ("github.com", "gitlab.com", "bitbucket.org") else "/".join(parts[:1]), None


def resolve_rust(idx: RepoIndex, importer: str, module: str, kind: str) -> Result:
    directory = posixpath.dirname(importer)
    stem = posixpath.splitext(posixpath.basename(importer))[0]
    if kind == "mod":
        base = directory if stem in ("mod", "lib", "main") else posixpath.join(directory, stem)
        found = idx.first_existing([_join(base, module + ".rs"), _join(base, module, "mod.rs")])
        return (INTERNAL, found, None, None) if found else (UNRESOLVED, None, None, "module file not found")
    segments = module.split("::")
    head = segments[0]
    if head in ("std", "core", "alloc"):
        return STDLIB, None, None, None
    if head in ("crate", "self", "super"):
        crate_dir = next((d for d in _ancestors(directory) if _join(d, "Cargo.toml") in idx.paths), "")
        src = _join(crate_dir, "src")
        if head == "crate":
            for length in range(len(segments) - 1, 0, -1):
                sub = segments[1 : 1 + length]
                found = idx.first_existing([_join(src, *sub) + ".rs", _join(src, *sub, "mod.rs")])
                if found:
                    return INTERNAL, found, None, None
        return INTERNAL, None, None, "module path inside the crate (file not resolved)"
    if head in idx.declared.cargo_packages:
        return INTERNAL, idx.declared.cargo_packages[head], None, "workspace crate"
    if head in idx.declared.cargo:
        return EXTERNAL, None, head, None
    return UNRESOLVED, None, None, "not std, crate-relative or a declared Cargo dependency"


def resolve_ruby(idx: RepoIndex, importer: str, module: str, kind: str) -> Result:
    directory = posixpath.dirname(importer)
    name = module if module.endswith(".rb") else module + ".rb"
    if kind in ("require_relative", "load"):
        found = idx.first_existing([_join(directory, name)])
        return (INTERNAL, found, None, None) if found else (UNRESOLVED, None, None, "file not found")
    if module in RUBY_STDLIB:
        return STDLIB, None, None, None
    for root in _ancestors(directory):
        found = idx.first_existing([_join(root, "lib", name), _join(root, name)])
        if found:
            return INTERNAL, found, None, None
    gem = module.split("/")[0]
    if gem in idx.declared.gems or module.replace("/", "-") in idx.declared.gems:
        return EXTERNAL, None, gem, None
    return UNRESOLVED, None, None, "not in lib/, the standard library or the Gemfile"


def resolve_c(idx: RepoIndex, importer: str, module: str, kind: str, cpp: bool) -> Result:
    directory = posixpath.dirname(importer)
    if kind == "include_system":
        if module in C_STD_HEADERS or (cpp and module in CPP_STD_HEADERS):
            return STDLIB, None, None, None
    local = [_join(directory, module), module]
    for root in _ancestors(directory):
        local += [_join(root, "include", module), _join(root, "src", module)]
    found = idx.first_existing(local)
    if found is None:  # unique suffix match, e.g. "util/helpers.h" living in another folder
        matches = [p for p in idx.basenames().get(posixpath.basename(module), []) if p.endswith("/" + module) or p == module]
        found = matches[0] if len(matches) == 1 else None
    if found:
        return INTERNAL, found, None, None
    return UNRESOLVED, None, None, "header not found in the repository (system and third-party headers are not indexed)"


def resolve(idx: RepoIndex, importer: str, language: str, module: str, kind: str, names: list[str], level: int) -> Result:
    if language == "Python":
        return resolve_python(idx, importer, module, names, level)
    if language in ("JavaScript", "TypeScript"):
        return resolve_js(idx, importer, module)
    if language == "Java":
        return resolve_java(idx, module, names)
    if language == "C#":
        return resolve_csharp(idx, module)
    if language == "PHP":
        return resolve_php(idx, importer, module, kind)
    if language == "Go":
        return resolve_go(idx, importer, module)
    if language == "Rust":
        return resolve_rust(idx, importer, module, kind)
    if language == "Ruby":
        return resolve_ruby(idx, importer, module, kind)
    if language in ("C", "C++"):
        return resolve_c(idx, importer, module, kind, language == "C++")
    return UNRESOLVED, None, None, f"no resolver for {language}"


_PACKAGE_RE = re.compile(r"[^A-Za-z0-9_.@/\-]")


def clean_package(package: str | None) -> str | None:
    return _PACKAGE_RE.sub("", package)[:120] if package else None
