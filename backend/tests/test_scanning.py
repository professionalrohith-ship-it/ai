import os
import sqlite3
import sys
import time

import pytest

from .conftest import inventory, register, scan, wait_for_scan, write


@pytest.fixture
def scanned(client, project):
    repo = register(client, project)
    result = scan(client, repo["id"])
    assert result["status"] == "completed", result
    return repo["id"], inventory(client, repo["id"])


# ---- languages ---------------------------------------------------------------------------------
def test_language_detection(scanned):
    _, files = scanned
    expected = {
        "src/index.js": "JavaScript", "src/app.ts": "TypeScript", "src/ui/Button.tsx": "TypeScript",
        "src/styles/site.css": "CSS", "public/index.html": "HTML", "server/main.py": "Python",
        "server/db/schema.sql": "SQL", "lib/Main.java": "Java", "cmd/tool/main.go": "Go",
    }
    for path, language in expected.items():
        assert files[path]["language"] == language, path


@pytest.mark.parametrize(
    "name,language",
    [("a.c", "C"), ("a.h", "C"), ("a.cpp", "C++"), ("a.hpp", "C++"), ("a.cs", "C#"), ("a.rs", "Rust"),
     ("a.php", "PHP"), ("a.rb", "Ruby"), ("Rakefile", "Ruby"), ("a.html", "HTML"), ("a.sql", "SQL")],
)
def test_remaining_languages(client, tmp_path, name, language):
    root = tmp_path / "langs"
    write(root, name, "x\n")
    repo = register(client, root)
    scan(client, repo["id"])
    assert inventory(client, repo["id"])[name]["language"] == language


def test_language_statistics(client, scanned):
    repo_id, _ = scanned
    stats = client.get(f"/api/repositories/{repo_id}/languages").json()
    names = [s["name"] for s in stats]
    assert {"JavaScript", "TypeScript", "Python", "Java", "Go", "SQL", "CSS", "HTML"} <= set(names)
    assert abs(sum(s["percent"] for s in stats) - 100) < 0.5
    assert all(s["files"] >= 1 and s["bytes"] > 0 for s in stats)
    assert stats == sorted(stats, key=lambda s: -s["bytes"])


# ---- frameworks, package managers, entry points, categories -----------------------------------
def test_framework_detection(client, scanned):
    repo_id, _ = scanned
    techs = {(t["name"], t["category"]): t for t in client.get(f"/api/repositories/{repo_id}/technologies").json()}
    assert techs[("React", "frontend-framework")]["version"] == "18.2.0"
    assert ("Express", "backend-framework") in techs
    assert ("FastAPI", "backend-framework") in techs
    assert ("Vite", "dev-tool") in techs and ("pytest", "dev-tool") in techs
    assert ("Docker", "dev-tool") in techs
    assert ("Python", "language") in techs
    assert ("npm", "package-manager") in techs and ("pip", "package-manager") in techs
    repo = client.get(f"/api/repositories/{repo_id}").json()
    assert {"React", "Express", "FastAPI"} <= set(repo["frameworks"])
    assert repo["mainLanguage"] and repo["languages"]


def test_framework_detection_for_other_ecosystems(client, tmp_path):
    root = tmp_path / "multi"
    write(root, "pyproject.toml", '[project]\ndependencies = ["django>=4.2", "celery"]\n')
    write(root, "Cargo.toml", '[dependencies]\naxum = "0.7"\ntokio = { version = "1" }\n')
    write(root, "go.mod", "module x\n\nrequire github.com/gin-gonic/gin v1.9.1\n")
    write(root, "composer.json", '{"require": {"laravel/framework": "^10.0"}}')
    write(root, "Gemfile", "gem 'rails', '~> 7.0'\n")
    write(root, "pom.xml", "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>")
    write(root, "App.csproj", '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>')
    repo = register(client, root)
    scan(client, repo["id"])
    names = {t["name"] for t in client.get(f"/api/repositories/{repo['id']}/technologies").json()}
    assert {"Django", "Celery", "Axum", "Tokio", "Gin", "Laravel", "Ruby on Rails", "Spring Boot",
            "ASP.NET Core", "Cargo", "Maven", "Composer", "Bundler", "NuGet", "Go modules"} <= names


def test_entry_points_tests_docs_config_manifests(client, scanned):
    repo_id, files = scanned
    assert files["src/index.js"]["isEntryPoint"] and files["server/main.py"]["isEntryPoint"]
    assert files["cmd/tool/main.go"]["isEntryPoint"]
    assert not files["src/ui/Button.tsx"]["isEntryPoint"]
    assert files["tests/test_main.py"]["category"] == "test"
    assert files["src/app.test.ts"]["category"] == "test"
    assert files["docs/guide.md"]["category"] == "doc" and files["README.md"]["category"] == "doc"
    for manifest in ("package.json", "requirements.txt", "package-lock.json"):
        assert files[manifest]["category"] == "manifest"
    for config in ("tsconfig.json", "Dockerfile", ".gitignore"):
        assert files[config]["category"] == "config"
    only_entries = inventory(client, repo_id, entryPoints="true")
    assert "src/index.js" in only_entries and "src/ui/Button.tsx" not in only_entries


def test_package_json_main_marks_entry_point(client, tmp_path):
    root = tmp_path / "pkg"
    write(root, "package.json", '{"main": "lib/entry.js", "bin": {"tool": "./bin/cli.js"}}')
    write(root, "lib/entry.js", "x\n")
    write(root, "bin/cli.js", "x\n")
    repo = register(client, root)
    scan(client, repo["id"])
    files = inventory(client, repo["id"])
    assert files["lib/entry.js"]["isEntryPoint"] and files["bin/cli.js"]["isEntryPoint"]


# ---- filtering ---------------------------------------------------------------------------------
def test_exclusions(scanned):
    _, files = scanned
    for excluded in (
        "node_modules/lib/index.js", "dist/bundle.js", "build/out.js", "__pycache__/m.pyc", ".venv/lib/x.py",
        "myenv/lib/y.py", "app.min.js", "scratch.tmp", "logo.png", "blob.dat",
    ):
        assert excluded not in files, excluded
    assert not any(p.startswith(".git/") for p in files)


def test_gitignore_and_negation(scanned):
    _, files = scanned
    assert "ignored_dir/a.py" not in files
    assert "notes.secret.txt" not in files
    assert "keep.secret.txt" in files  # re-included by "!keep.secret.txt"
    assert ".gitignore" in files


def test_nested_gitignore_is_relative_to_its_directory(client, tmp_path):
    root = tmp_path / "nested"
    write(root, "pkg/.gitignore", "gen.py\n/local.py\n")
    write(root, "pkg/gen.py", "x")
    write(root, "pkg/local.py", "x")
    write(root, "pkg/sub/local.py", "x")
    write(root, "pkg/sub/gen.py", "x")
    write(root, "gen.py", "x")
    repo = register(client, root)
    scan(client, repo["id"])
    files = inventory(client, repo["id"])
    assert "gen.py" in files and "pkg/sub/local.py" in files
    assert "pkg/gen.py" not in files and "pkg/local.py" not in files and "pkg/sub/gen.py" not in files


def test_binary_content_detected_even_with_text_extension(scanned):
    _, files = scanned
    assert "weird.py" not in files


def test_configurable_exclusions_per_scan_and_global(client, settings, project):
    repo = register(client, project)
    result = scan(client, repo["id"], extraExcludes=["lib/", "*.sql"])
    assert result["status"] == "completed"
    files = inventory(client, repo["id"])
    assert "lib/Main.java" not in files and "server/db/schema.sql" not in files and "src/app.ts" in files


def test_target_and_bin_only_excluded_next_to_build_files(client, tmp_path):
    root = tmp_path / "builds"
    write(root, "Cargo.toml", "[package]\n")
    write(root, "target/debug/x.rs", "x")
    write(root, "src/main.rs", "fn main(){}")
    write(root, "tools/bin/run.py", "x")  # no .csproj next to it: a real source directory
    repo = register(client, root)
    scan(client, repo["id"])
    files = inventory(client, repo["id"])
    assert "target/debug/x.rs" not in files and "tools/bin/run.py" in files and "src/main.rs" in files


# ---- security ----------------------------------------------------------------------------------
def test_secret_files_listed_but_never_read(client, scanned):
    repo_id, files = scanned
    env = files[".env"]
    assert env["isSensitive"] is True and env["sha256"] is None and env["lineCount"] is None
    assert files[".env.example"]["isSensitive"] is False
    dump = client.get(f"/api/repositories/{repo_id}/files").text + client.get(f"/api/repositories/{repo_id}/tree").text
    assert "supersecret" not in dump


def test_secret_value_is_not_stored_anywhere(settings, scanned):
    con = sqlite3.connect(settings.db_path)
    dump = "\n".join(con.iterdump())
    con.close()
    assert "supersecret" not in dump


@pytest.mark.skipif(sys.platform == "win32", reason="creating symlinks needs elevated rights on Windows")
def test_symlinks_are_not_followed(client, tmp_path):
    outside = tmp_path / "outside"
    write(outside, "secret.py", "x")
    root = tmp_path / "linked"
    write(root, "a.py", "x")
    os.symlink(outside, root / "escape", target_is_directory=True)
    os.symlink(root, root / "loop", target_is_directory=True)
    os.symlink(outside / "secret.py", root / "file_link.py")
    repo = register(client, root)
    scan(client, repo["id"])
    assert list(inventory(client, repo["id"])) == ["a.py"]


def test_junction_loop_is_not_followed(client, tmp_path):
    if sys.platform != "win32":
        pytest.skip("junctions are Windows only")
    import subprocess

    root = tmp_path / "junc"
    write(root, "a.py", "x")
    outside = tmp_path / "outside"
    write(outside, "secret.py", "x")
    subprocess.run(["cmd", "/c", "mklink", "/J", str(root / "escape"), str(outside)], check=True, capture_output=True)
    repo = register(client, root)
    scan(client, repo["id"])
    assert list(inventory(client, repo["id"])) == ["a.py"]


def test_tree_rejects_traversal(client, scanned):
    repo_id, _ = scanned
    for bad in ("../", "src/../../x", "..\\..\\Windows", "C:/Windows", "~/x"):
        response = client.get(f"/api/repositories/{repo_id}/tree", params={"path": bad})
        assert response.status_code == 422, bad


def test_scanner_never_executes_repository_code(client, tmp_path):
    root = tmp_path / "evil"
    marker = tmp_path / "executed.txt"
    write(root, "setup.py", f"open(r'{marker}', 'w').write('x')\n")
    write(root, "package.json", '{"scripts": {"postinstall": "node evil.js"}}')
    write(root, "conftest.py", f"open(r'{marker}', 'w').write('x')\n")
    repo = register(client, root)
    scan(client, repo["id"])
    assert not marker.exists()


# ---- persistence, rescans, progress ------------------------------------------------------------
def test_inventory_hashes_lines_and_sizes(scanned):
    _, files = scanned
    main = files["server/main.py"]
    assert main["lineCount"] == 3 and len(main["sha256"]) == 64 and main["sizeBytes"] > 0


def test_scan_result_and_counts(client, scanned):
    repo_id, files = scanned
    result = client.get(f"/api/repositories/{repo_id}/scan-result").json()
    assert result["files"] == len(files) and result["isDemo"] is False
    assert result["folders"] >= 8 and result["durationSeconds"] >= 0
    assert result["fileCategories"]["test"] == 2 and result["fileCategories"]["doc"] == 2
    assert result["sensitiveFilesSkipped"] == 1
    assert "npm" in result["packageManagers"] and "src/index.js" in result["entryPoints"]
    assert result["skipped"]["binary"] >= 2 and result["skipped"]["excluded_dir"] >= 3
    assert result["languages"][0]["percent"] > 0
    repo = client.get(f"/api/repositories/{repo_id}").json()
    assert repo["status"] == "indexed" and repo["fileCount"] == len(files) and repo["lastAnalysed"]


def test_rescan_has_no_duplicates_and_tracks_unchanged_files(settings, client, project):
    repo = register(client, project)
    first = scan(client, repo["id"])
    count = len(inventory(client, repo["id"]))
    assert first["filesChanged"] == count and first["filesUnchanged"] == 0
    second = scan(client, repo["id"])
    assert second["filesChanged"] == 0 and second["filesUnchanged"] == count
    assert len(inventory(client, repo["id"])) == count
    con = sqlite3.connect(settings.db_path)
    assert con.execute("select count(*) from files").fetchone()[0] == count
    assert con.execute("select count(*) from repositories").fetchone()[0] == 1
    assert con.execute("select count(*) from scans").fetchone()[0] == 2
    con.close()


def test_rescan_detects_changed_new_and_deleted_files(client, project):
    repo = register(client, project)
    scan(client, repo["id"])
    before = inventory(client, repo["id"])
    write(project, "server/main.py", "print('changed')\nprint('more')\nprint('lines')\nx = 1\n")
    write(project, "server/new_module.py", "x = 1\n")
    (project / "src" / "app.ts").unlink()
    time.sleep(0.02)
    second = scan(client, repo["id"])
    after = inventory(client, repo["id"])
    assert "server/new_module.py" in after and "src/app.ts" not in after
    assert after["server/main.py"]["sha256"] != before["server/main.py"]["sha256"]
    assert after["server/main.py"]["lineCount"] == 4
    assert second["filesChanged"] == 2  # modified + new
    assert after["README.md"]["sha256"] == before["README.md"]["sha256"]


def test_touched_but_identical_file_counts_as_unchanged(client, project):
    repo = register(client, project)
    scan(client, repo["id"])
    target = project / "src" / "index.js"
    os.utime(target, ns=(1_700_000_000_000_000_000, 1_700_000_000_000_000_000))
    second = scan(client, repo["id"])
    assert second["filesChanged"] == 0


def test_progress_fields_and_stage_order(client, project):
    repo = register(client, project)
    response = client.post(f"/api/repositories/{repo['id']}/scans")
    assert response.status_code == 202
    started = response.json()
    assert started["status"] in ("queued", "running", "completed")
    done = wait_for_scan(client, started["scanId"])
    assert done["progress"] == 100 and done["stage"] == "complete" and done["stageIndex"] == 6
    assert done["filesDiscovered"] > 0 and done["foldersDiscovered"] > 0
    assert "Python" in done["languagesDetected"] and "React" in done["frameworksDetected"]
    assert done["finishedAt"] and done["error"] is None
    latest = client.get(f"/api/repositories/{repo['id']}/scans/latest").json()
    assert latest["scanId"] == started["scanId"]


def test_concurrent_scan_of_same_repository_is_rejected(client, project, monkeypatch):
    import threading

    gate = threading.Event()
    from app import scan_manager

    real = scan_manager.scan_tree

    def slow(*args, **kwargs):
        gate.wait(10)
        return real(*args, **kwargs)

    monkeypatch.setattr(scan_manager, "scan_tree", slow)
    repo = register(client, project)
    first = client.post(f"/api/repositories/{repo['id']}/scans")
    assert first.status_code == 202
    second = client.post(f"/api/repositories/{repo['id']}/scans")
    assert second.status_code == 409 and second.json()["detail"]["code"] == "scan_running"
    assert client.delete(f"/api/repositories/{repo['id']}").status_code == 409
    assert client.get(f"/api/repositories/{repo['id']}").json()["status"] == "indexing"
    gate.set()
    wait_for_scan(client, first.json()["scanId"])


def test_scan_runs_in_background_and_api_stays_responsive(client, project, monkeypatch):
    import threading

    from app import scan_manager

    gate = threading.Event()
    real = scan_manager.scan_tree
    monkeypatch.setattr(scan_manager, "scan_tree", lambda *a, **k: (gate.wait(10), real(*a, **k))[1])
    repo = register(client, project)
    started = time.time()
    scan_id = client.post(f"/api/repositories/{repo['id']}/scans").json()["scanId"]
    assert time.time() - started < 2
    assert client.get("/api/health").status_code == 200
    assert client.get(f"/api/scans/{scan_id}").json()["status"] in ("queued", "running")
    gate.set()
    wait_for_scan(client, scan_id)


# ---- failures ----------------------------------------------------------------------------------
def test_scan_fails_cleanly_when_folder_disappears(client, tmp_path):
    root = tmp_path / "vanishing"
    write(root, "a.py", "x")
    repo = register(client, root)
    (root / "a.py").unlink()
    root.rmdir()
    done = scan(client, repo["id"])
    assert done["status"] == "failed" and "exist" in done["error"].lower() or done["error"]
    assert client.get(f"/api/repositories/{repo['id']}").json()["status"] == "error"


def test_failed_rescan_keeps_previous_results(client, tmp_path):
    root = tmp_path / "keeps"
    write(root, "a.py", "x\n")
    repo = register(client, root)
    scan(client, repo["id"])
    (root / "a.py").unlink()
    root.rmdir()
    done = scan(client, repo["id"])
    assert done["status"] == "failed"
    after = client.get(f"/api/repositories/{repo['id']}").json()
    assert after["status"] == "indexed" and after["fileCount"] == 1 and after["lastError"]


def test_unreadable_file_is_recorded_and_scan_continues(client, project, monkeypatch):
    from app.scanner import walker

    real = walker._hash_and_count

    def flaky(path):
        if path.endswith("schema.sql"):
            raise PermissionError("denied")
        return real(path)

    monkeypatch.setattr(walker, "_hash_and_count", flaky)
    repo = register(client, project)
    done = scan(client, repo["id"])
    assert done["status"] == "completed" and done["errorCount"] == 1
    assert done["errors"][0] == {"path": "server/db/schema.sql", "message": "permission denied"}
    assert "server/db/schema.sql" not in inventory(client, repo["id"])


def test_unreadable_directory_is_recorded(client, project, monkeypatch):
    real = os.scandir

    def deny(path="."):
        if str(path).replace("\\", "/").endswith("/docs"):
            raise PermissionError("denied")
        return real(path)

    monkeypatch.setattr("app.scanner.walker.os.scandir", deny)
    repo = register(client, project)
    done = scan(client, repo["id"])
    assert done["status"] == "completed"
    assert any(e["path"] == "docs" for e in done["errors"])


def test_file_limit_truncates_with_error(settings, project):
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(replace(settings, max_files_per_scan=5))) as small:
        repo = register(small, project)
        done = scan(small, repo["id"])
        assert done["status"] == "completed" and done["filesDiscovered"] == 5
        assert any("limit" in e["message"] for e in done["errors"])
        assert small.get(f"/api/repositories/{repo['id']}/scan-result").json()["truncated"] is True


def test_restart_marks_interrupted_scans_failed(settings, project):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(settings)) as first:
        repo = register(first, project)
        con = sqlite3.connect(settings.db_path)
        con.execute("insert into scans (id, repository_id, status, started_at) values ('scan-x', ?, 'running', '2025-01-01T00:00:00+00:00')", (repo["id"],))
        con.execute("update repositories set status='indexing' where id=?", (repo["id"],))
        con.commit()
        con.close()
    with TestClient(create_app(settings)) as second:
        assert second.get("/api/scans/scan-x").json()["status"] == "failed"
        assert second.get(f"/api/repositories/{repo['id']}").json()["status"] == "error"


# ---- API reads ---------------------------------------------------------------------------------
def test_scan_result_before_scan_is_404(client, project):
    repo = register(client, project)
    response = client.get(f"/api/repositories/{repo['id']}/scan-result")
    assert response.status_code == 404 and response.json()["detail"]["code"] == "no_completed_scan"
    assert client.get(f"/api/repositories/{repo['id']}/scans/latest").status_code == 404
    assert client.get("/api/scans/unknown").status_code == 404


def test_unknown_repository_endpoints_404(client):
    for url in ("languages", "technologies", "tree", "files", "scan-result", "scans/latest"):
        assert client.get(f"/api/repositories/missing/{url}").status_code == 404, url
    assert client.post("/api/repositories/missing/scans").status_code == 404


def test_directory_tree(client, scanned):
    repo_id, _ = scanned
    tree = client.get(f"/api/repositories/{repo_id}/tree").json()
    names = [n["name"] for n in tree]
    kinds = [n["type"] for n in tree]
    assert kinds == sorted(kinds, key=lambda k: k != "folder")  # folders first
    folders = [n["name"] for n in tree if n["type"] == "folder"]
    assert folders == sorted(folders, key=str.lower)
    assert "node_modules" not in names and ".venv" not in names and "ignored_dir" not in names
    src = next(n for n in tree if n["name"] == "src")
    assert src["type"] == "folder" and src["path"] == "src" and src["fileCount"] == 5
    ui = next(n for n in src["children"] if n["name"] == "ui")
    assert ui["children"] == [{"path": "src/ui/Button.tsx", "name": "Button.tsx", "type": "file", "fileCount": None, "children": None}]
    shallow = client.get(f"/api/repositories/{repo_id}/tree", params={"depth": 1}).json()
    assert next(n for n in shallow if n["name"] == "src").get("children") is None


def test_subtree_and_missing_folder(client, scanned):
    repo_id, _ = scanned
    sub = client.get(f"/api/repositories/{repo_id}/tree", params={"path": "src"}).json()
    assert {n["name"] for n in sub} == {"ui", "styles", "index.js", "app.ts", "app.test.ts"}
    assert sub[0]["path"].startswith("src/")
    assert client.get(f"/api/repositories/{repo_id}/tree", params={"path": "nope"}).status_code == 404


def test_file_listing_filters_and_paging(client, scanned):
    repo_id, files = scanned
    tests = client.get(f"/api/repositories/{repo_id}/files", params={"category": "test"}).json()
    assert tests["total"] == 2
    ts = client.get(f"/api/repositories/{repo_id}/files", params={"language": "TypeScript"}).json()
    assert {i["path"] for i in ts["items"]} == {"src/app.ts", "src/ui/Button.tsx", "src/app.test.ts"}
    page = client.get(f"/api/repositories/{repo_id}/files", params={"limit": 3, "offset": 1}).json()
    assert page["total"] == len(files) and len(page["items"]) == 3
    search = client.get(f"/api/repositories/{repo_id}/files", params={"q": "100%_"}).json()
    assert search["total"] == 0  # LIKE wildcards are escaped
    assert client.get(f"/api/repositories/{repo_id}/files", params={"category": "bogus"}).status_code == 422
    assert client.get(f"/api/repositories/{repo_id}/files", params={"limit": 5000}).status_code == 422


def test_delete_removes_all_metadata(settings, client, scanned):
    repo_id, _ = scanned
    assert client.delete(f"/api/repositories/{repo_id}").status_code == 204
    con = sqlite3.connect(settings.db_path)
    for table in ("repositories", "scans", "files", "directories", "technologies", "scan_errors"):
        assert con.execute(f"select count(*) from {table}").fetchone()[0] == 0, table
    con.close()


def test_data_survives_restart(settings, project):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(settings)) as first:
        repo = register(first, project)
        scan(first, repo["id"])
        count = len(inventory(first, repo["id"]))
    with TestClient(create_app(settings)) as second:
        again = second.get(f"/api/repositories/{repo['id']}").json()
        assert again["status"] == "indexed" and again["fileCount"] == count
        assert len(inventory(second, repo["id"])) == count


def test_same_name_different_folders_are_separate(client, tmp_path):
    a, b = tmp_path / "x" / "app", tmp_path / "y" / "app"
    write(a, "one.py", "1")
    write(b, "two.py", "1")
    ra, rb = register(client, a), register(client, b)
    scan(client, ra["id"]), scan(client, rb["id"])
    assert set(inventory(client, ra["id"])) == {"one.py"} and set(inventory(client, rb["id"])) == {"two.py"}


def test_paths_with_spaces_and_unicode(client, tmp_path):
    root = tmp_path / "My Project (1) é"
    write(root, "sub dir/файл.py", "x = 1\n")
    repo = register(client, root)
    scan(client, repo["id"])
    assert "sub dir/файл.py" in inventory(client, repo["id"])
