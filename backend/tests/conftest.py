import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def write(root: Path, rel: str, content: str | bytes = "") -> Path:
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        target.write_bytes(content)
    else:
        target.write_text(content, encoding="utf-8")
    return target


@pytest.fixture
def settings(tmp_path):
    return Settings(db_path=tmp_path / "db" / "test.db", scan_workers=2)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def project(tmp_path):
    """A small polyglot repository used by most tests."""
    root = tmp_path / "sample-project"
    write(root, "README.md", "# Sample\n")
    write(root, "package.json", '{"name":"x","main":"src/index.js","dependencies":{"react":"^18.2.0","express":"4.19.0"},'
                                 '"devDependencies":{"vite":"^5.0.0","typescript":"^5.4.0"}}')
    write(root, "package-lock.json", "{}")
    write(root, "tsconfig.json", "{}")
    write(root, "requirements.txt", "fastapi==0.110.0\npytest>=8\n# comment\n-r other.txt\n")
    write(root, "src/index.js", "console.log('hi')\n")
    write(root, "src/app.ts", "export const a = 1\n")
    write(root, "src/ui/Button.tsx", "export const B = () => null\n")
    write(root, "src/styles/site.css", "body{}\n")
    write(root, "public/index.html", "<html></html>\n")
    write(root, "server/main.py", "print('x')\n\nprint('y')")
    write(root, "server/db/schema.sql", "select 1;\n")
    write(root, "tests/test_main.py", "def test_x():\n    pass\n")
    write(root, "src/app.test.ts", "test('a', () => {})\n")
    write(root, "docs/guide.md", "guide\n")
    write(root, "Dockerfile", "FROM scratch\n")
    write(root, "lib/Main.java", "class Main {}\n")
    write(root, "cmd/tool/main.go", "package main\n")
    write(root, ".env", "SECRET_TOKEN=supersecret\n")
    write(root, ".env.example", "SECRET_TOKEN=\n")
    write(root, ".gitignore", "ignored_dir/\n*.secret.txt\n!keep.secret.txt\n")
    write(root, "ignored_dir/a.py", "x=1\n")
    write(root, "notes.secret.txt", "hidden\n")
    write(root, "keep.secret.txt", "kept\n")
    write(root, "node_modules/lib/index.js", "x\n")
    write(root, "dist/bundle.js", "x\n")
    write(root, "build/out.js", "x\n")
    write(root, "__pycache__/m.pyc", b"\x00\x01")
    write(root, "logo.png", b"\x89PNG\r\n\x1a\n\x00\x00")
    write(root, "blob.dat", b"\x00\x01\x02")
    write(root, "weird.py", b"\x00\x00binary but named py")
    write(root, "app.min.js", "x\n")
    write(root, "scratch.tmp", "x\n")
    write(root, ".venv/pyvenv.cfg", "home = x\n")
    write(root, ".venv/lib/x.py", "x\n")
    write(root, "myenv/pyvenv.cfg", "home = x\n")
    write(root, "myenv/lib/y.py", "y\n")
    return root


def wait_for_scan(client, scan_id, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/api/scans/{scan_id}").json()
        if data["status"] in ("completed", "failed"):
            return data
        time.sleep(0.05)
    raise AssertionError("scan did not finish")


def register(client, path, **extra):
    response = client.post("/api/repositories", json={"path": str(path), **extra})
    assert response.status_code == 201, response.text
    return response.json()


def scan(client, repo_id, **body):
    response = client.post(f"/api/repositories/{repo_id}/scans", json=body)
    assert response.status_code == 202, response.text
    return wait_for_scan(client, response.json()["scanId"])


def inventory(client, repo_id, **params):
    """All inventory paths for a repository (optionally filtered)."""
    data = client.get(f"/api/repositories/{repo_id}/files", params={"limit": 1000, **params}).json()
    return {item["path"]: item for item in data["items"]}
