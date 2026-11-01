import os
import sqlite3
import sys

import pytest

from .conftest import register, write


def test_register_returns_frontend_shape(client, project):
    repo = register(client, project, description="demo")
    assert repo["id"].startswith("repo-sample-project-")
    assert repo["name"] == "sample-project"
    assert repo["status"] == "not-indexed"
    assert repo["fileCount"] == 0 and repo["lastAnalysed"] is None
    assert repo["origin"] == "added" and repo["isGit"] is False
    assert repo["description"] == "demo"


def test_unique_ids_and_multiple_repositories(client, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    write(a, "x.py", "1")
    write(b, "x.py", "1")
    ids = {register(client, a)["id"], register(client, b, name="Custom B")["id"]}
    assert len(ids) == 2
    listed = client.get("/api/repositories").json()
    assert [r["name"] for r in listed] == ["a", "Custom B"]


def test_duplicate_detection(client, project):
    register(client, project)
    again = client.post("/api/repositories", json={"path": str(project) + os.sep})
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "duplicate_repository"
    check = client.post("/api/repositories/validate", json={"path": str(project)}).json()
    assert check["valid"] is False and "already registered" in check["message"]


def test_duplicate_via_different_spelling(client, project):
    register(client, project)
    spelled = str(project / "src" / "..")
    assert client.post("/api/repositories", json={"path": spelled}).status_code == 409


@pytest.mark.skipif(sys.platform != "win32", reason="Windows case-insensitive paths")
def test_duplicate_ignores_case_and_slashes_on_windows(client, project):
    register(client, project)
    variant = str(project).upper().replace("\\", "/")
    assert client.post("/api/repositories", json={"path": variant}).status_code == 409


@pytest.mark.skipif(sys.platform != "win32", reason="Windows path syntax")
def test_windows_extended_prefix_and_quotes(client, project):
    repo = register(client, '"\\\\?\\' + str(project) + '"')
    assert not repo["path"].startswith("\\\\?\\")
    assert os.path.samefile(repo["path"], project)


@pytest.mark.skipif(sys.platform != "win32", reason="Windows path syntax")
def test_windows_drive_relative_path_rejected(client):
    response = client.post("/api/repositories", json={"path": "C:projects"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "path,status,code",
    [
        ("", 422, "invalid_path"),
        ("relative/dir", 422, "invalid_path"),
        ("bad\u0000path", 422, "invalid_path"),
    ],
)
def test_invalid_paths(client, path, status, code):
    response = client.post("/api/repositories", json={"path": path})
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


def test_missing_path(client, tmp_path):
    response = client.post("/api/repositories", json={"path": str(tmp_path / "nope")})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "path_not_found"


def test_file_instead_of_directory(client, tmp_path):
    f = write(tmp_path, "file.txt", "x")
    response = client.post("/api/repositories", json={"path": str(f)})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "not_a_directory"


def test_drive_root_rejected(client):
    root = os.path.abspath(os.sep)
    response = client.post("/api/repositories", json={"path": root})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "path_too_broad"


def test_permission_error(client, tmp_path, monkeypatch):
    target = tmp_path / "locked"
    target.mkdir()
    real = os.scandir

    def deny(path="."):
        if str(path).endswith("locked"):
            raise PermissionError("denied")
        return real(path)

    monkeypatch.setattr("app.repo_service.os.scandir", deny)
    response = client.post("/api/repositories", json={"path": str(target)})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_validate_endpoint(client, project):
    ok = client.post("/api/repositories/validate", json={"path": str(project)}).json()
    assert ok["valid"] is True and ok["normalizedPath"]
    bad = client.post("/api/repositories/validate", json={"path": "C:/definitely/not/here"}).json()
    assert bad["valid"] is False and bad["message"]


def test_git_repository_detected(client, tmp_path):
    root = tmp_path / "gitrepo"
    write(root, "a.py", "1")
    sha = "a" * 40
    write(root, ".git/HEAD", "ref: refs/heads/feature/x\n")
    write(root, ".git/refs/heads/feature/x", sha + "\n")
    repo = register(client, root)
    assert repo["isGit"] is True and repo["branch"] == "feature/x" and repo["commit"] == sha


def test_git_packed_refs_and_detached_head(client, tmp_path):
    packed = tmp_path / "packed"
    write(packed, ".git/HEAD", "ref: refs/heads/main\n")
    write(packed, ".git/packed-refs", "# pack-refs\n" + "b" * 40 + " refs/heads/main\n")
    assert register(client, packed)["commit"] == "b" * 40
    detached = tmp_path / "detached"
    write(detached, ".git/HEAD", "c" * 40 + "\n")
    repo = register(client, detached)
    assert repo["branch"] is None and repo["commit"] == "c" * 40


def test_git_file_pointer_is_not_followed(client, tmp_path):
    root = tmp_path / "worktree"
    write(root, "a.py", "1")
    write(root, ".git", "gitdir: C:/somewhere/else\n")
    repo = register(client, root)
    assert repo["isGit"] is True and repo["branch"] is None


def test_ordinary_directory_is_not_git(client, project):
    assert register(client, project)["isGit"] is False


def test_unknown_and_deleted(client, project):
    assert client.get("/api/repositories/nope").status_code == 404
    repo = register(client, project)
    assert client.delete(f"/api/repositories/{repo['id']}").status_code == 204
    assert client.get(f"/api/repositories/{repo['id']}").status_code == 404
    assert client.delete(f"/api/repositories/{repo['id']}").status_code == 404


def test_registration_persists_in_sqlite(settings, client, project):
    repo = register(client, project)
    con = sqlite3.connect(settings.db_path)
    row = con.execute("select name, path from repositories where id=?", (repo["id"],)).fetchone()
    con.close()
    assert row[0] == "sample-project" and os.path.samefile(row[1], project)
