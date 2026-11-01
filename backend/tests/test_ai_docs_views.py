import json
import os
import sqlite3
from pathlib import Path

import pytest

from app.views import fs_suggestions

from .ai_helpers import FakeProvider, ai_client, apirepo, fake, prepare  # noqa: F401  (fixtures)
from .conftest import register, scan, write
from .test_code_intelligence import codebase, parsed, run_parse  # noqa: F401  (fixtures)


@pytest.fixture
def repo_id(client, codebase):
    return prepare(client, codebase)


def generate(client, repo_id, doc_type, **body):
    response = client.post(f"/api/repositories/{repo_id}/documentation", json={"type": doc_type, **body})
    assert response.status_code == 200, response.text
    return response.json()


# ---- documentation -----------------------------------------------------------------------------
def test_documentation_types(client):
    types = client.get("/api/documentation/types").json()
    assert [t["id"] for t in types] == ["project-overview", "architecture", "module", "api", "dependency-report"]
    assert all(t["label"] and t["description"] for t in types)


def test_overview_is_built_from_real_data_without_any_ai(client, repo_id):
    doc = generate(client, repo_id, "project-overview")
    assert doc["status"] == "ready" and doc["format"] == "markdown" and doc["type"] == "project-overview"
    assert doc["aiEnhanced"] is False and doc["repositoryName"] == "codebase" and doc["title"] == "codebase: Project overview"
    text = doc["content"]
    assert text.startswith("# codebase: project overview") and "## Languages" in text
    assert "| Python |" in text and "| TypeScript |" in text and "| Go |" in text
    assert "## Directory structure (two levels)" in text and "- `app/` (" in text and "- `web/` (" in text
    assert "`app/main.py`" in text  # entry point
    languages = {l["name"]: l for l in client.get(f"/api/repositories/{repo_id}/languages").json()}
    assert f"| Python | {languages['Python']['files']} | {languages['Python']['lines']} |" in text
    assert any("No AI provider is configured" in w and "CODEMIND_AI_PROVIDER" in w for w in doc["warnings"])


def test_architecture_document(client, repo_id):
    text = generate(client, repo_id, "architecture")["content"]
    assert "## Modules" in text and "| `app` |" in text and "| `web` |" in text and "heuristic" in text
    assert "## How modules import each other" in text and "| `tests` | `app` |" in text
    assert "## Most depended-on files" in text and "## Circular dependencies" in text and "No circular dependencies" in text
    assert "## External packages" in text and "requests" in text


def test_module_document(client, repo_id):
    doc = generate(client, repo_id, "module", module="app")
    text = doc["content"]
    assert doc["module"] == "app" and doc["title"] == "codebase: Module reference (app)" and text.startswith("# Module `app`")
    assert "## `app/models.py`" in text and "Models." in text
    assert "**class** `User` (lines 5-8): A user." in text and "**method** `save" in text
    assert "## `app/utils.py`" in text and "`helper(x)`" in text
    assert client.post(f"/api/repositories/{repo_id}/documentation", json={"type": "module"}).json()["detail"]["code"] == "module_required"
    assert client.post(f"/api/repositories/{repo_id}/documentation", json={"type": "module", "module": "../x"}).json()["detail"]["code"] == "module_required"
    missing = client.post(f"/api/repositories/{repo_id}/documentation", json={"type": "module", "module": "nope"})
    assert missing.status_code == 422 and missing.json()["detail"]["code"] == "module_not_found"


def test_api_document_with_no_endpoints_says_so(client, repo_id):
    text = generate(client, repo_id, "api")["content"]
    assert "No HTTP endpoints were detected by the supported patterns." in text and "may be missing or incomplete" in text


def test_api_endpoint_detection_across_frameworks(client, apirepo):
    repo_id = prepare(client, apirepo)
    text = generate(client, repo_id, "api")["content"]
    rows = {tuple(c.strip(" `") for c in line.split("|")[1:5]) for line in text.splitlines() if line.startswith("| ") and "---" not in line}
    expected = {
        ("GET", "/api/items", "list_items", "api/routes.py:5"),  # APIRouter prefix applied (line of the def)
        ("POST", "/api/items/{item_id}", "create_item", "api/routes.py:9"),
        ("GET", "/ping", "ping", "flask_app.py:5"), ("POST", "/ping", "ping", "flask_app.py:5"),
        ("GET", "/health", "", "server.js:3"), ("POST", "/users", "createUser", "server.js:4"),
        ("GET", "/users/{id}", "get", "src/main/java/UserController.java:4"), ("POST", "/users", "add", "src/main/java/UserController.java:6"),
        ("GET", "/gin", "ginHandler", "main.go:4"), ("ANY", "/legacy", "legacy", "main.go:5"),
        ("GET", "/api/items/{id}", "Get", "Items.cs:3"),
    }
    assert expected <= rows, expected - rows
    assert not any("should-not-count" in r[1] for r in rows)  # axios client calls are not endpoints


def test_dependency_document(client, repo_id):
    text = generate(client, repo_id, "dependency-report")["content"]
    assert "## Declared packages" in text and "| requests | ==2.31 | PyPI | production | imported |" in text
    assert "| react | ^18 | npm | production | imported |" in text and "| monolog/monolog | ^3 | Composer | production | declared-only |" in text
    assert "## Unresolved imports" in text and "`missing_mod`" in text and "## Most depended-on files" in text


def test_documents_before_parse_warn_instead_of_failing(client, codebase):
    repo_id = prepare(client, codebase, parse=False)
    for doc_type in ("architecture", "api", "dependency-report"):
        doc = generate(client, repo_id, doc_type)
        assert any("not been parsed" in w for w in doc["warnings"]), doc_type
    assert "No HTTP endpoints" in generate(client, repo_id, "api")["content"]


def test_ai_summary_is_added_when_a_provider_exists(ai_client, fake, codebase):
    repo_id = prepare(ai_client, codebase)
    fake.reply = "This is a small multi-language sample project."
    doc = generate(ai_client, repo_id, "project-overview", instructions="Keep it friendly")
    assert doc["aiEnhanced"] is True and doc["warnings"] == []
    text = doc["content"]
    assert "## Summary" in text and "This is a small multi-language sample project." in text and "AI-generated" in text
    assert text.index("## Summary") < text.index("## Languages")  # summary sits above the factual sections
    prompt = fake.last_prompt
    assert "<<<FACTS" in prompt and "| Python |" in prompt and "Keep it friendly" in prompt and "ONLY the facts" in fake.calls[0]["system"]
    assert len(fake.calls) == 1


def test_ai_summary_failure_does_not_fail_the_document(ai_client, fake, codebase):
    repo_id = prepare(ai_client, codebase)
    fake.error = "Ollama returned HTTP 500."
    doc = generate(ai_client, repo_id, "project-overview")
    assert doc["status"] == "ready" and doc["aiEnhanced"] is False and "## Languages" in doc["content"]
    assert any("AI summary was skipped" in w and "HTTP 500" in w for w in doc["warnings"])
    fake.error = None
    off = generate(ai_client, repo_id, "project-overview", useAi=False)
    assert off["aiEnhanced"] is False and off["warnings"] == [] and len(fake.calls) == 1  # only the failed attempt


def test_document_listing_export_and_delete(client, repo_id):
    first = generate(client, repo_id, "project-overview")
    second = generate(client, repo_id, "module", module="app")
    listing = client.get(f"/api/repositories/{repo_id}/documentation").json()
    assert [d["id"] for d in listing] == [second["id"], first["id"]] and listing[1]["content"] == first["content"]
    assert client.get(f"/api/documentation/{first['id']}").json()["title"] == first["title"]
    exported = client.get(f"/api/documentation/{first['id']}/export")
    assert exported.status_code == 200 and exported.headers["content-type"].startswith("text/markdown")
    assert exported.headers["content-disposition"] == 'attachment; filename="codebase-Project-overview.md"'
    assert exported.text == first["content"]
    as_json = client.get(f"/api/documentation/{second['id']}/export", params={"format": "json"})
    assert as_json.headers["content-type"] == "application/json" and ".json" in as_json.headers["content-disposition"]
    assert json.loads(as_json.text)["module"] == "app"
    assert client.get(f"/api/documentation/{first['id']}/export", params={"format": "pdf"}).status_code == 422
    assert client.delete(f"/api/documentation/{first['id']}").status_code == 204
    assert client.get(f"/api/documentation/{first['id']}").status_code == 404
    assert client.get(f"/api/documentation/{first['id']}/export").status_code == 404
    assert client.delete(f"/api/documentation/{first['id']}").status_code == 404


def test_export_filename_is_sanitised(client, tmp_path):
    root = tmp_path / "we ird&name;x"
    write(root, "a.py", "def a(): pass\n")
    repo_id = prepare(client, root)
    doc = generate(client, repo_id, "project-overview")
    header = client.get(f"/api/documentation/{doc['id']}/export").headers["content-disposition"]
    assert header.startswith('attachment; filename="') and all(c not in header.split('filename=')[1] for c in "&;\\ ")


def test_documentation_validation_and_scan_requirement(client, codebase):
    repo = register(client, codebase)
    unscanned = client.post(f"/api/repositories/{repo['id']}/documentation", json={"type": "api"})
    assert unscanned.status_code == 409 and unscanned.json()["detail"]["code"] == "scan_required"
    scan(client, repo["id"])
    assert client.post(f"/api/repositories/{repo['id']}/documentation", json={"type": "poem"}).json()["detail"]["code"] == "invalid_type"
    assert client.post("/api/repositories/missing/documentation", json={"type": "api"}).status_code == 404
    assert client.get("/api/repositories/missing/documentation").status_code == 404


def test_documentation_agent_in_chat_saves_a_document(ai_client, fake, codebase):
    repo_id = prepare(ai_client, codebase)
    data = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Generate documentation for the app module directory"}).json()
    assert data["agent"] == "documentation" and "saved it as a document" in data["assistantMessage"]["content"]
    docs = ai_client.get(f"/api/repositories/{repo_id}/documentation").json()
    assert len(docs) == 1 and docs[0]["type"] == "module" and docs[0]["module"] == "app" and docs[0]["aiEnhanced"] is True


# ---- architecture ------------------------------------------------------------------------------
def test_architecture_endpoint(client, repo_id):
    data = client.get(f"/api/repositories/{repo_id}/architecture").json()
    assert data["parsed"] is True and "heuristic" in data["typeNote"] and data["analysedAt"]
    modules = {m["id"]: m for m in data["modules"]}
    assert {"app", "web", "tests", "lib", "php", "cs"} <= set(modules)
    app = modules["app"]
    assert app["path"] == "app" and app["label"] == "app" and app["fileCount"] == 4 and app["languages"] == ["Python"]
    assert "app/models.py" in app["files"] and "Defines: Base, User" in app["description"] and app["subtitle"] == "4 files · Python"
    assert modules["web"]["type"] == "frontend" and modules["tests"]["type"] == "module"
    edges = {(e["source"], e["target"]): e for e in data["edges"]}
    assert edges[("tests", "app")]["imports"] == 1 and edges[("tests", "app")]["label"] == "1 import"
    assert ("app", "app") not in edges  # no self edges
    assert {"name": "requests", "files": 1} in data["externalPackages"]
    assert "app/main.py" in data["entryPoints"]
    overview = data["overview"]
    assert overview["totalModules"] == len(data["modules"]) and overview["apiConnections"] == len(data["edges"])
    assert overview["frontendComponents"] >= modules["web"]["fileCount"] and set(overview) == {"totalModules", "frontendComponents", "backendServices", "apiConnections"}
    assert all(m["type"] in ("client", "frontend", "api", "service", "database", "module") for m in data["modules"])


def test_architecture_splits_a_monorepo_root(client, tmp_path):
    root = tmp_path / "mono"
    for i in range(6):
        write(root, f"src/api/h{i}.py", "def f(): pass\n")
        write(root, f"src/services/s{i}.py", "def g(): pass\n")
        write(root, f"src/db/m{i}.py", "def h(): pass\n")
    write(root, "src/main.py", "from src.api import h0\n")
    write(root, "README.md", "x\n")
    repo_id = prepare(client, root)
    data = client.get(f"/api/repositories/{repo_id}/architecture").json()
    modules = {m["id"]: m["type"] for m in data["modules"]}
    assert modules["src/api"] == "api" and modules["src/services"] == "service" and modules["src/db"] == "database" and "src" in modules
    assert any(e["source"] == "src" and e["target"] == "src/api" for e in data["edges"])


def test_architecture_before_parse_and_scan(client, codebase):
    repo = register(client, codebase)
    assert client.get(f"/api/repositories/{repo['id']}/architecture").json()["detail"]["code"] == "scan_required"
    scan(client, repo["id"])
    data = client.get(f"/api/repositories/{repo['id']}/architecture").json()
    assert data["parsed"] is False and data["edges"] == [] and data["modules"] and "not been parsed" in data["message"]
    assert client.get("/api/repositories/missing/architecture").status_code == 404


# ---- packages ----------------------------------------------------------------------------------
def test_packages_endpoint(client, repo_id):
    packages = {(p["name"], p["manifest"]): p for p in client.get(f"/api/repositories/{repo_id}/packages").json()}
    requests = packages[("requests", "requirements.txt")]
    assert requests["version"] == "==2.31" and requests["ecosystem"] == "PyPI" and requests["type"] == "production" and requests["usage"] == "imported"
    assert requests["observedImports"] == [{"file": "app/main.py", "statement": "import requests"}] and requests["relatedFiles"] == ["app/main.py"]
    assert packages[("PyYAML", "requirements.txt")]["version"] == "*" and packages[("PyYAML", "requirements.txt")]["usage"] == "imported"  # import name 'yaml'
    assert packages[("react", "web/package.json")]["ecosystem"] == "npm" and packages[("react", "web/package.json")]["usage"] == "imported"
    assert packages[("@scope/pkg", "web/package.json")]["usage"] == "imported"
    assert packages[("serde", "Cargo.toml")]["ecosystem"] == "Cargo" and packages[("serde", "Cargo.toml")]["usage"] == "imported"
    assert packages[("monolog/monolog", "composer.json")]["usage"] == "declared-only"
    assert packages[("rails", "Gemfile")]["ecosystem"] == "RubyGems" and packages[("Newtonsoft.Json", "cs/App.csproj")]["ecosystem"] == "NuGet"
    assert packages[("github.com/gin-gonic/gin", "go.mod")]["ecosystem"] == "Go" and packages[("github.com/gin-gonic/gin", "go.mod")]["version"] == "v1.9.1"
    assert all(set(p) == {"name", "version", "ecosystem", "type", "usage", "manifest", "observedImports", "relatedFiles"} for p in packages.values())


def test_package_types_and_tooling(client, tmp_path):
    root = tmp_path / "pkgs"
    write(root, "package.json", '{"dependencies": {"left-pad": "^1.0.0"}, "devDependencies": {"vitest": "^1.0.0", "eslint": "9"}}')
    write(root, "src/a.js", "const l = require('left-pad');\n")
    write(root, "requirements-dev.txt", "pytest>=8\nblack==24.1\n")
    write(root, "pyproject.toml", '[project]\ndependencies = ["fastapi>=0.1"]\n[project.optional-dependencies]\ndev = ["ruff"]\nextra = ["numpy"]\n'
                                  '[tool.poetry.group.test.dependencies]\nhypothesis = "^6"\n')
    write(root, "Cargo.toml", '[dependencies]\nserde = "1"\n[dev-dependencies]\ncriterion = "0.5"\n')
    write(root, "composer.json", '{"require": {"php": ">=8", "ext-json": "*", "laravel/framework": "^10"}, "require-dev": {"phpunit/phpunit": "^10"}}')
    write(root, "Gemfile", "gem 'rails'\ngroup :development, :test do\n  gem 'rspec'\nend\ngem 'puma'\n")
    repo_id = prepare(client, root)
    packages = {p["name"]: p for p in client.get(f"/api/repositories/{repo_id}/packages").json()}
    assert packages["left-pad"]["type"] == "production" and packages["left-pad"]["usage"] == "imported"
    assert packages["vitest"]["type"] == "development" and packages["vitest"]["usage"] == "tooling" and packages["eslint"]["version"] == "9"
    assert packages["pytest"]["type"] == "development" and packages["black"]["version"] == "==24.1"
    assert packages["fastapi"]["type"] == "production" and packages["ruff"]["type"] == "development" and packages["numpy"]["type"] == "production"
    assert packages["hypothesis"]["type"] == "development" and packages["criterion"]["type"] == "development"
    assert packages["laravel/framework"]["usage"] == "declared-only" and packages["phpunit/phpunit"]["usage"] == "tooling"
    assert "php" not in packages and "ext-json" not in packages
    assert packages["rspec"]["type"] == "development" and packages["puma"]["type"] == "production"
    assert client.get("/api/repositories/missing/packages").status_code == 404


def test_packages_require_a_scan_and_survive_bad_manifests(client, tmp_path):
    root = tmp_path / "bad"
    write(root, "package.json", "{ not json")
    write(root, "Cargo.toml", "= broken toml")
    repo = register(client, root)
    assert client.get(f"/api/repositories/{repo['id']}/packages").json()["detail"]["code"] == "scan_required"
    scan(client, repo["id"])
    assert client.get(f"/api/repositories/{repo['id']}/packages").json() == []


# ---- single file view --------------------------------------------------------------------------
def test_file_view(client, repo_id, codebase):
    data = client.get(f"/api/repositories/{repo_id}/file", params={"path": "app/models.py"}).json()
    assert data["path"] == "app/models.py" and data["language"] == "Python" and data["extension"] == ".py" and data["encoding"] == "utf-8"
    assert data["content"] == (codebase / "app" / "models.py").read_bytes().decode("utf-8")  # exactly what is on disk
    assert data["lineCount"] == 8 and data["sizeBytes"] == len(data["content"].encode()) and data["truncated"] is False and data["stale"] is False
    assert {"name": "User", "kind": "class", "startLine": 5, "endLine": 8, "parent": None} in data["symbols"]
    assert {"name": "save", "kind": "method", "startLine": 7, "endLine": 8, "parent": "User"} in data["symbols"]
    assert data["importedBy"] == ["app/main.py"] and "app/main.py" in data["relatedFiles"] and data["lastModified"].endswith("+00:00")
    main = client.get(f"/api/repositories/{repo_id}/file", params={"path": "app/main.py"}).json()
    imports = {i["module"]: i for i in main["imports"]}
    assert imports["os"]["depType"] == "stdlib" and imports[".models"] == {"module": ".models", "line": 5, "depType": "internal", "resolvedPath": "app/models.py"}
    assert "app/models.py" in main["relatedFiles"] and "tests/test_main.py" in main["relatedFiles"]


def test_file_view_flags_stale_and_truncated_content(client, codebase):
    write(codebase, "big.txt", "".join(f"line {i} " + "x" * 90 + "\n" for i in range(12000)))
    repo_id = prepare(client, codebase)
    big = client.get(f"/api/repositories/{repo_id}/file", params={"path": "big.txt"}).json()
    assert big["truncated"] is True and len(big["content"].encode()) <= 1024 * 1024 and big["lineCount"] == 12000 and big["stale"] is False
    write(codebase, "app/utils.py", "# edited\ndef helper(x):\n    return x\n")
    fresh = client.get(f"/api/repositories/{repo_id}/file", params={"path": "app/utils.py"}).json()
    assert fresh["stale"] is True and fresh["content"].startswith("# edited")


def test_file_view_refuses_unsafe_paths(client, tmp_path):
    root = tmp_path / "fv"
    write(root, "ok.py", "x = 1\n")
    write(root, ".env", "TOKEN=supersecret\n")
    write(root, "logo.png", b"\x89PNG\x00\x00")
    repo_id = prepare(client, root, parse=False)
    sensitive = client.get(f"/api/repositories/{repo_id}/file", params={"path": ".env"})
    assert sensitive.status_code == 403 and "supersecret" not in sensitive.text
    assert client.get(f"/api/repositories/{repo_id}/file", params={"path": "logo.png"}).status_code == 404  # binaries are not in the inventory
    assert client.get(f"/api/repositories/{repo_id}/file", params={"path": "ghost.py"}).status_code == 404
    for bad in ("../x", "..\\..\\Windows\\win.ini", "C:/Windows/win.ini", "~/x"):
        assert client.get(f"/api/repositories/{repo_id}/file", params={"path": bad}).status_code == 422, bad
    assert client.get(f"/api/repositories/{repo_id}/file").status_code == 422
    (root / "ok.py").unlink()
    assert client.get(f"/api/repositories/{repo_id}/file", params={"path": "ok.py"}).json()["detail"]["code"] == "file_missing"


def test_file_view_binary_content_is_refused(client, tmp_path):
    root = tmp_path / "bin"
    write(root, "data.py", "x = 1\n")
    repo_id = prepare(client, root, parse=False)
    (root / "data.py").write_bytes(b"\x00\x01\x02binary now")
    response = client.get(f"/api/repositories/{repo_id}/file", params={"path": "data.py"})
    assert response.status_code == 415 and response.json()["detail"]["code"] == "binary_file"


# ---- folder suggestions ------------------------------------------------------------------------
def test_folder_suggestions(tmp_path, monkeypatch, client):
    home = tmp_path / "home"
    (home / "Desktop" / "git-proj" / ".git").mkdir(parents=True)
    (home / "projects" / "node-app").mkdir(parents=True)
    (home / "projects" / "node-app" / "package.json").write_text("{}")
    (home / "projects" / "empty-dir").mkdir()
    (home / "py-app").mkdir()
    (home / "py-app" / "requirements.txt").write_text("x")
    (home / "Documents" / "dotnet").mkdir(parents=True)
    (home / "Documents" / "dotnet" / "App.sln").write_text("")
    (home / "Documents" / "notes").mkdir()
    (home / "Documents" / "notes" / "todo.txt").write_text("secret todo")
    (home / ".hidden" / "p").mkdir(parents=True)
    (home / ".hidden" / "p" / "package.json").write_text("{}")
    (home / "Desktop" / "loose-file.txt").write_text("x")
    found = {s["name"]: s for s in fs_suggestions(home)}
    assert set(found) == {"git-proj", "node-app", "py-app", "dotnet"}
    assert found["git-proj"]["hint"] == "Git repository" and found["node-app"]["hint"] == "Detected package.json"
    assert found["py-app"]["hint"] == "Detected requirements.txt" and found["dotnet"]["hint"] == "Detected App.sln"
    assert Path(found["git-proj"]["path"]) == home / "Desktop" / "git-proj"
    assert len(fs_suggestions(home, limit=2)) == 2 and fs_suggestions(tmp_path / "nowhere") == []
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    api = client.get("/api/fs/suggestions").json()
    assert {s["name"] for s in api} == set(found) and all(set(s) == {"name", "path", "hint"} for s in api)


def test_folder_suggestions_dedupe_and_limit(tmp_path):
    home = tmp_path / "h"
    for i in range(40):
        (home / "dev" / f"p{i:02d}").mkdir(parents=True)
        (home / "dev" / f"p{i:02d}" / "go.mod").write_text("module x")
    (home / "projects").mkdir()
    suggestions = fs_suggestions(home)
    assert len(suggestions) == 30 and len({s["path"] for s in suggestions}) == 30


# ---- repository list ---------------------------------------------------------------------------
def test_repository_list_reports_parse_state(client, codebase):
    repo = register(client, codebase)
    assert client.get(f"/api/repositories/{repo['id']}").json()["parsed"] is False
    scan(client, repo["id"])
    listing = client.get("/api/repositories").json()
    assert listing[0]["parsed"] is False and listing[0]["lastParsedAt"] is None
    run_parse(client, repo["id"])
    again = client.get(f"/api/repositories/{repo['id']}").json()
    assert again["parsed"] is True and again["lastParsedAt"] and client.get("/api/repositories").json()[0]["parsed"] is True
