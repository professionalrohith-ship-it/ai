"""NetworkX analysis, symbol references and code sections."""
import os
import stat as stat_module

import pytest

from .conftest import register, scan, write
from .test_code_intelligence import codebase, parsed, run_parse  # noqa: F401  (shared fixtures)


@pytest.fixture
def cyclic(client, tmp_path):
    root = tmp_path / "cyc"
    write(root, "requirements.txt", "requests\n")
    write(root, "pkg/__init__.py", "")
    write(root, "pkg/a.py", "from pkg import b\n\ndef fa():\n    pass\n")
    write(root, "pkg/b.py", "from pkg.a import fa\n\ndef fb():\n    fa()\n")
    write(root, "pkg/c.py", "import requests\nfrom pkg.a import fa\n\ndef fc():\n    fa()\n")
    write(root, "pkg/lonely.py", "def alone():\n    pass\n")
    repo = register(client, root)
    scan(client, repo["id"])
    assert run_parse(client, repo["id"])["status"] == "completed"
    return repo["id"], root


@pytest.fixture
def refs(client, tmp_path):
    root = tmp_path / "refs"
    write(root, "lib.py", "def helper():\n    return 1\n\nclass Base:\n    pass\n")
    write(root, "a.py", "from lib import helper, Base\n\nclass A(Base):\n    def m(self):\n        helper()\n")
    write(root, "b.py", "def helper():\n    pass\n\ndef n():\n    helper()\n")
    write(root, "c.py", "import lib\n\nlib.helper()\n")
    write(root, ".env", "TOKEN=abc\n")
    repo = register(client, root)
    scan(client, repo["id"])
    assert run_parse(client, repo["id"])["status"] == "completed"
    return repo["id"], root


def symbol_id(client, repo_id, name, path):
    items = client.get(f"/api/repositories/{repo_id}/symbols", params={"q": name, "exact": "true", "path": path}).json()["items"]
    assert len(items) == 1, items
    return items[0]["id"]


# ---- graph statistics --------------------------------------------------------------------------
def test_stats_detect_cycle_and_importance(client, cyclic):
    repo_id, _ = cyclic
    stats = client.get(f"/api/repositories/{repo_id}/graph/stats").json()
    assert stats["files"] == 5 and stats["internalEdges"] == 3  # a->b, b->a, c->a
    assert stats["isAcyclic"] is False
    group = stats["circularDependencies"][0]
    assert group["size"] == 2 and group["files"] == ["pkg/a.py", "pkg/b.py"]
    cycle = group["exampleCycle"]
    assert cycle[0] == cycle[-1] and set(cycle) == {"pkg/a.py", "pkg/b.py"}
    top = stats["importantModules"][0]
    assert top["path"] == "pkg/a.py" and top["fanIn"] == 2 and top["fanOut"] == 1
    assert top["transitiveDependents"] == 2  # b and c (a itself excluded)
    assert [p for p in stats["topExternalPackages"]] == [{"package": "requests", "files": 1}]
    assert stats["externalPackages"] == 1
    assert "pkg/lonely.py" in stats["isolatedExamples"] and stats["isolatedFiles"] == 2  # lonely + empty __init__
    assert stats["entryCandidates"] == ["pkg/c.py"]
    assert stats["connectedComponents"] == 3 and stats["largestComponent"] == 3
    assert "harmless" in stats["cycleNote"]
    assert stats["heaviestImporters"][0]["fanOut"] >= 1


def test_acyclic_repository(client, parsed):
    repo_id, _ = parsed
    stats = client.get(f"/api/repositories/{repo_id}/graph/stats").json()
    assert stats["isAcyclic"] is True and stats["circularDependencies"] == []
    assert stats["files"] > 20 and stats["internalEdges"] >= 10 and stats["externalPackages"] >= 4
    paths = {m["path"] for m in stats["importantModules"]}
    assert "app/utils.py" in paths or "app/models.py" in paths
    assert "tests/test_main.py" in stats["entryCandidates"]
    assert 0 < stats["density"] < 1 and stats["averageFanOut"] > 0
    pkgs = {p["package"] for p in stats["topExternalPackages"]}
    assert {"requests", "react"} <= pkgs


def test_stats_for_repository_without_parse_are_empty(client, tmp_path):
    root = tmp_path / "empty"
    write(root, "a.py", "x = 1\n")
    repo = register(client, root)
    stats = client.get(f"/api/repositories/{repo['id']}/graph/stats").json()
    assert stats["files"] == 0 and stats["internalEdges"] == 0 and stats["isAcyclic"] is True
    assert stats["importantModules"] == [] and stats["connectedComponents"] == 0
    assert client.get("/api/repositories/missing/graph/stats").status_code == 404


def test_cycle_disappears_after_incremental_update(client, cyclic):
    repo_id, root = cyclic
    write(root, "pkg/b.py", "def fb():\n    pass\n")  # drops the import of a
    scan(client, repo_id)
    run = run_parse(client, repo_id)
    assert run["parsedFiles"] == 1
    stats = client.get(f"/api/repositories/{repo_id}/graph/stats").json()
    assert stats["isAcyclic"] is True and stats["internalEdges"] == 2


def test_file_relationships(client, cyclic):
    repo_id, _ = cyclic
    a = client.get(f"/api/repositories/{repo_id}/graph/file", params={"path": "pkg/a.py"}).json()
    assert a["imports"] == ["pkg/b.py"] and a["importedBy"] == ["pkg/b.py", "pkg/c.py"]
    assert a["inCycle"] is True and a["cycleWith"] == ["pkg/b.py"]
    assert a["transitiveDependents"] == 2 and a["transitiveDependencies"] == 1
    c = client.get(f"/api/repositories/{repo_id}/graph/file", params={"path": "pkg/c.py"}).json()
    assert c["imports"] == ["pkg/a.py"] and c["importedBy"] == [] and c["externalPackages"] == ["requests"]
    assert c["inCycle"] is False and c["transitiveDependencyFiles"] == ["pkg/a.py", "pkg/b.py"]
    lonely = client.get(f"/api/repositories/{repo_id}/graph/file", params={"path": "pkg/lonely.py"}).json()
    assert lonely["imports"] == [] and lonely["importedBy"] == [] and lonely["transitiveDependencies"] == 0
    assert client.get(f"/api/repositories/{repo_id}/graph/file", params={"path": "nope.py"}).status_code == 404
    assert client.get(f"/api/repositories/{repo_id}/graph/file", params={"path": "../x"}).status_code == 422


# ---- references --------------------------------------------------------------------------------
def test_references_to_a_function(client, refs):
    repo_id, _ = refs
    sid = symbol_id(client, repo_id, "helper", "lib.py")
    data = client.get(f"/api/repositories/{repo_id}/symbols/{sid}/references").json()
    importers = {i["path"]: i for i in data["importedBy"]}
    assert set(importers) == {"a.py", "c.py"} and data["importedByTotal"] == 2
    assert importers["a.py"]["evidence"] == "imports-symbol" and importers["a.py"]["names"] == ["helper", "Base"]
    assert importers["c.py"]["evidence"] == "imports-module" and importers["c.py"]["line"] == 1
    calls = {(r["path"], r["confidence"]) for r in data["references"] if r["kind"] == "calls"}
    assert calls == {("a.py", "high"), ("c.py", "high"), ("b.py", "name-match-only")}
    assert data["references"][-1]["path"] == "b.py"  # name-only matches sort after confident ones
    assert data["symbol"]["name"] == "helper" and "name" in data["note"]


def test_references_include_inheritance(client, refs):
    repo_id, _ = refs
    sid = symbol_id(client, repo_id, "Base", "lib.py")
    data = client.get(f"/api/repositories/{repo_id}/symbols/{sid}/references").json()
    assert [(r["path"], r["kind"], r["source"], r["confidence"]) for r in data["references"]] == [("a.py", "extends", "A", "high")]
    assert [(i["path"], i["evidence"]) for i in data["importedBy"]] == [("a.py", "imports-symbol"), ("c.py", "imports-module")]


def test_reference_limit_and_unknown_symbol(client, refs):
    repo_id, _ = refs
    sid = symbol_id(client, repo_id, "helper", "lib.py")
    limited = client.get(f"/api/repositories/{repo_id}/symbols/{sid}/references", params={"limit": 1}).json()
    assert len(limited["references"]) == 1 and limited["referencesTotal"] == 3
    assert client.get(f"/api/repositories/{repo_id}/symbols/999999/references").status_code == 404
    assert client.get(f"/api/repositories/{repo_id}/symbols/999999").status_code == 404
    assert client.get(f"/api/repositories/{repo_id}/symbols/abc").status_code == 422


# ---- code sections -----------------------------------------------------------------------------
def test_symbol_detail_returns_numbered_source(client, refs):
    repo_id, _ = refs
    sid = symbol_id(client, repo_id, "Base", "lib.py")
    detail = client.get(f"/api/repositories/{repo_id}/symbols/{sid}").json()
    assert detail["symbol"]["startLine"] == 4 and detail["symbol"]["endLine"] == 5
    assert detail["code"]["lines"] == [{"number": 4, "text": "class Base:"}, {"number": 5, "text": "    pass"}]
    assert detail["code"]["totalLines"] == 5 and detail["code"]["stale"] is False and detail["codeTruncated"] is False
    wide = client.get(f"/api/repositories/{repo_id}/symbols/{sid}", params={"context": 2}).json()
    assert [l["number"] for l in wide["code"]["lines"]] == [2, 3, 4, 5]  # clipped at the end of the file


def test_code_endpoint_ranges(client, refs):
    repo_id, _ = refs
    section = client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 3, "end": 4}).json()
    assert [l["number"] for l in section["lines"]] == [3, 4] and section["lines"][0]["text"] == "class A(Base):"
    assert section["startLine"] == 3 and section["endLine"] == 4 and section["totalLines"] == 5
    clipped = client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 4, "end": 99}).json()
    assert clipped["endLine"] == 5 and len(clipped["lines"]) == 2
    assert client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 9, "end": 12}).status_code == 422
    assert client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 5, "end": 2}).json()["detail"]["code"] == "invalid_range"
    big = client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 1, "end": 700})
    assert big.status_code == 422 and big.json()["detail"]["code"] == "range_too_large"


def test_code_endpoint_handles_crlf(client, tmp_path):
    root = tmp_path / "crlf"
    (root).mkdir()
    (root / "w.py").write_bytes(b"def f():\r\n    return 1\r\n")
    repo = register(client, root)
    scan(client, repo["id"])
    lines = client.get(f"/api/repositories/{repo['id']}/code", params={"path": "w.py", "start": 1, "end": 2}).json()["lines"]
    assert [l["text"] for l in lines] == ["def f():", "    return 1"]


def test_code_endpoint_refuses_unsafe_requests(client, refs):
    repo_id, _ = refs
    sensitive = client.get(f"/api/repositories/{repo_id}/code", params={"path": ".env"})
    assert sensitive.status_code == 403 and sensitive.json()["detail"]["code"] == "sensitive_file"
    assert "abc" not in sensitive.text
    assert client.get(f"/api/repositories/{repo_id}/code", params={"path": "ghost.py"}).status_code == 404
    for bad in ("../secret.txt", "..\\..\\Windows\\win.ini", "C:/Windows/win.ini", "~/x"):
        assert client.get(f"/api/repositories/{repo_id}/code", params={"path": bad}).status_code == 422, bad
    assert client.get("/api/repositories/missing/code", params={"path": "a.py"}).status_code == 404


def test_code_endpoint_flags_stale_and_missing_files(client, refs):
    repo_id, root = refs
    write(root, "a.py", "# added line\nfrom lib import helper, Base\n")
    stale = client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py", "start": 1, "end": 2}).json()
    assert stale["stale"] is True and stale["lines"][0]["text"] == "# added line"
    (root / "b.py").unlink()
    missing = client.get(f"/api/repositories/{repo_id}/code", params={"path": "b.py"})
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "file_missing"


def test_code_endpoint_refuses_non_regular_and_outside_files(client, refs, monkeypatch):
    from app.intelligence import code_access

    repo_id, _ = refs
    real_lstat = os.lstat

    class Link:
        st_mode = stat_module.S_IFLNK
        st_size = 5

    monkeypatch.setattr(code_access.os, "lstat", lambda p: Link() if str(p).endswith("a.py") else real_lstat(p))
    response = client.get(f"/api/repositories/{repo_id}/code", params={"path": "a.py"})
    assert response.status_code == 403 and response.json()["detail"]["code"] == "not_a_regular_file"
    monkeypatch.setattr(code_access.os, "lstat", real_lstat)
    monkeypatch.setattr(code_access.os.path, "commonpath", lambda paths: "elsewhere")
    response = client.get(f"/api/repositories/{repo_id}/code", params={"path": "b.py"})
    assert response.status_code == 403 and response.json()["detail"]["code"] == "outside_repository"


def test_large_files_are_not_returned(settings, tmp_path):
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.main import create_app

    root = tmp_path / "large"
    write(root, "big.py", "x = 1\n" * 50)
    with TestClient(create_app(replace(settings, max_file_bytes=100))) as small:
        repo = register(small, root)
        scan(small, repo["id"])  # the scanner already leaves oversize files out of the inventory
        assert small.get(f"/api/repositories/{repo['id']}/code", params={"path": "big.py"}).status_code == 404


def test_unsupported_language_files_can_still_be_viewed(client, parsed, ):
    repo_id, _ = parsed
    section = client.get(f"/api/repositories/{repo_id}/code", params={"path": "site/index.html"}).json()
    assert section["lines"][0]["text"] == "<html></html>"
