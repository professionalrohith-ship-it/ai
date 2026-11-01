import json
import os
import stat as stat_module

import pytest

from app.ai.agents import AGENTS
from app.ai.evidence import EvidenceSet, cited_ids, format_evidence_block, ground_answer, redact, tokenize
from app.ai.reader import RepoReader
from app.ai.stacktrace import map_to_inventory, parse_frames
from app.ai.supervisor import Supervisor, route_request

from .ai_helpers import FakeProvider, TRACE, ai_client, apirepo, bugrepo, fake, prepare  # noqa: F401  (fixtures)
from .conftest import register, scan, write
from .test_code_intelligence import codebase, parsed, run_parse  # noqa: F401  (fixtures)


@pytest.fixture
def repo_id(ai_client, codebase):
    return prepare(ai_client, codebase)


# ---- routing -----------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "question,agent",
    [
        ("What is this repository about and where do I start?", "repository-explorer"),
        ("Give me an overview of the folder structure", "repository-explorer"),
        ("Explain the architecture of this application", "architecture-analyst"),
        ("How are the modules connected to each other?", "architecture-analyst"),
        ("What does the helper function do?", "code-intelligence"),
        ("Where is the User class defined?", "code-intelligence"),
        ("Which files import app/utils.py?", "dependency-analyst"),
        ("Are there circular dependencies or unused packages?", "dependency-analyst"),
        ("I get a KeyError when saving, the app crashes", "bug-investigator"),
        ("Traceback (most recent call last):\n  File \"a.py\", line 3, in f", "bug-investigator"),
        ("Generate documentation for the API", "documentation"),
        ("Write a README for this project", "documentation"),
    ],
)
def test_each_agent_is_reachable(question, agent):
    assert route_request(question)[0] == agent


def test_routing_override_symbols_and_follow_ups():
    assert route_request("Explain the architecture", forced="bug-investigator")[0] == "bug-investigator"
    assert "asked for" in route_request("x", forced="documentation")[1]
    assert route_request("tell me about parse_source", symbol_mention=True)[0] == "code-intelligence"
    assert route_request("and the second one?", previous_agent="dependency-analyst")[0] == "dependency-analyst"
    assert "follow-up" in route_request("and the second one?", previous_agent="dependency-analyst")[1]
    long_question = "please walk me through every single detail of how everything works here today"
    assert route_request(long_question, previous_agent="dependency-analyst")[0] == "repository-explorer"
    assert route_request("hello there")[0] == "repository-explorer"
    assert route_request("where is the error handling implemented?")[0] == "code-intelligence"  # 'error' alone is weak


def test_langgraph_supervisor_runs_exactly_one_agent_node():
    supervisor = Supervisor()
    nodes = set(supervisor.graph.get_graph().nodes)
    assert {"route", "finalize", *AGENTS} <= nodes
    calls = []

    def runner(agent_id, question):
        calls.append((agent_id, question))
        return {"answer": "x", "steps": [{"agentId": agent_id, "label": "did it"}], "status": "completed"}

    result = supervisor.run("Which files import app/utils.py?", runner)
    assert calls == [("dependency-analyst", "Which files import app/utils.py?")]
    assert result["agent"] == "dependency-analyst" and "dependenc" in result["routeReason"].lower()
    assert result["steps"][0]["agentId"] == "supervisor" and "Dependency Analyst" in result["steps"][0]["label"]
    assert result["steps"][1] == {"agentId": "dependency-analyst", "label": "did it"}
    forced = supervisor.run("anything", runner, forced="documentation")
    assert forced["agent"] == "documentation" and calls[-1][0] == "documentation"


def test_agent_catalogue(client):
    agents = client.get("/api/ai/agents").json()
    assert [a["id"] for a in agents] == ["repository-explorer", "architecture-analyst", "code-intelligence",
                                         "bug-investigator", "dependency-analyst", "documentation"]
    assert all(a["name"] and a["role"] and a["description"] and a["usesAi"] for a in agents)


# ---- evidence helpers --------------------------------------------------------------------------
def test_redaction():
    text = ('API_KEY = "sk-abcdefghijklmnopqrstuvwx"\npassword: "hunter2hunter2"\naws = AKIAABCDEFGHIJKLMNOP\n'
            'headers = {"Authorization": "Bearer abcdefghijklmnopqrstuvwxyz123456"}\n'
            "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\nname = \"short\"\nx = 5\ngh = ghp_abcdefghijklmnopqrstuvwxyz0123456789")
    cleaned = redact(text)
    for secret in ("sk-abcdefghijklmnopqrstuvwx", "hunter2hunter2", "AKIAABCDEFGHIJKLMNOP", "abcdefghijklmnopqrstuvwxyz123456",
                   "MIIabc", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"):
        assert secret not in cleaned
    assert 'name = "short"' in cleaned and "x = 5" in cleaned and cleaned.count("[REDACTED]") >= 6


def test_evidence_set_ids_dedupe_and_redaction():
    ev = EvidenceSet()
    first = ev.add("a.py", 1, 5, "symbol", "r", 'token = "abcdefghijkl"')
    assert first.id == "E1" and "[REDACTED]" in first.snippet
    assert ev.add("a.py", 1, 5, "symbol", "again", "x") is None
    assert ev.add("a.py", 6, 9, "symbol", "r", "y").id == "E2" and ev.by_id()["E2"].start_line == 6
    block = format_evidence_block(ev.items, 5000)
    assert block.startswith("<<<REPOSITORY_EVIDENCE") and block.endswith("<<<END_REPOSITORY_EVIDENCE>>>") and "[E2] a.py:6-9" in block


def test_prompt_block_respects_the_budget():
    ev = EvidenceSet()
    for i in range(6):
        ev.add(f"f{i}.py", 1, 400, "file", "big", "line\n" * 2000)
    assert len(format_evidence_block(ev.items, 3000)) < 6000


def test_tokenize_splits_identifiers():
    tokens, identifiers = tokenize("How does parse_source and the UserService handle errors?")
    assert "parse_source" in identifiers and "UserService" in identifiers
    assert {"parse", "source", "user", "service"} <= set(tokens) and "how" not in tokens


def test_grounding_files_come_from_evidence_only():
    ev = EvidenceSet()
    ev.add("app/models.py", 5, 8, "symbol", "definition of class User", "x")
    ev.add("", 0, 0, "overview", "facts", "y")
    inventory = {"app/models.py", "app/main.py"}
    files, warnings = ground_answer("User is in app/models.py [E1] and the facts say so [E2, E1].", ev.items, inventory)
    assert files == [{"path": "app/models.py", "line": 5, "reason": "definition of class User"}] and warnings == []
    files, warnings = ground_answer("See app/ghost.py:3 and src/nothing.js [E99].", ev.items, inventory)
    assert files == []
    assert any("E99" in w for w in warnings) and any("app/ghost.py" in w and "src/nothing.js" in w for w in warnings)
    assert any("did not cite" in w for w in warnings)
    assert cited_ids("[E1][E2, E3] and E4") == ["E1", "E2", "E3"]


# ---- stack traces ------------------------------------------------------------------------------
def test_stack_frame_parsing_across_languages():
    py = parse_frames(TRACE)
    assert [(f.path, f.line, f.function) for f in py] == [("/home/dev/proj/app/service.py", 10, "run"), ("/home/dev/proj/main.py", 3, "<module>")]
    js = parse_frames("TypeError: x is not a function\n    at handler (/srv/app/src/api/users.js:42:13)\n    at Layer.handle (node:internal/x:1:1)\n    at /srv/app/src/index.ts:10:5")
    assert [(f.path, f.line) for f in js] == [("/srv/app/src/api/users.js", 42), ("/srv/app/src/index.ts", 10)]
    java = parse_frames("java.lang.NullPointerException\n\tat com.acme.Svc.run(Svc.java:27)\n\tat com.acme.Main.main(Main.java:9)")
    assert [(f.path, f.line) for f in java] == [("Svc.java", 27), ("Main.java", 9)]
    assert [(f.path, f.line) for f in parse_frames("panic at main.go:12 and src/lib.rs:7:3")] == [("main.go", 12), ("src/lib.rs", 7)]
    assert [(f.path, f.line) for f in parse_frames("at Program.Main() in C:\\proj\\Program.cs:line 14")][:1] == [("C:\\proj\\Program.cs", 14)]
    assert parse_frames("nothing useful here") == []


def test_frames_map_only_to_inventory_files():
    inventory = {"app/service.py", "main.py", "a/util.py", "b/util.py"}
    assert map_to_inventory("/home/dev/proj/app/service.py", inventory) == ("app/service.py", False)
    assert map_to_inventory("C:\\proj\\main.py", inventory) == ("main.py", False)
    assert map_to_inventory("util.py", inventory) == (None, True)  # ambiguous basename
    assert map_to_inventory("/usr/lib/python3/site.py", inventory) == (None, False)
    assert map_to_inventory("b/util.py", inventory) == ("b/util.py", False)


# ---- retrieval ---------------------------------------------------------------------------------
def test_context_search_works_without_any_provider(client, codebase):
    repo_id = prepare(client, codebase)
    data = client.post(f"/api/repositories/{repo_id}/context/search", json={"query": "User class in app/models.py", "limit": 6}).json()
    assert data["parsed"] is True and data["items"]
    first = data["items"][0]
    assert first["id"] == "E1" and first["path"] == "app/models.py" and first["kind"] == "file"
    symbol = next(i for i in data["items"] if i["kind"] == "symbol" and i["symbol"] == "User")
    assert "class User(Base):" in symbol["snippet"] and symbol["startLine"] == 5 and symbol["endLine"] == 8
    assert "5 | class User(Base):" in symbol["snippet"]  # real line numbers
    nothing = client.post(f"/api/repositories/{repo_id}/context/search", json={"query": "zzqqxx frobnicate", "limit": 5}).json()
    assert nothing["items"] == []
    clamp = client.post(f"/api/repositories/{repo_id}/context/search", json={"query": "helper", "limit": 500}).json()
    assert 1 <= len(clamp["items"]) <= 30


def test_retrieval_falls_back_to_code_search(client, tmp_path):
    root = tmp_path / "grepme"
    write(root, "notes.py", "# Plain script, no functions\nVALUE = 1\nprint('FROBNICATE_MODE enabled')\n")
    repo_id = prepare(client, root, parse=False)
    items = client.post(f"/api/repositories/{repo_id}/context/search", json={"query": "where is FROBNICATE_MODE used"}).json()
    assert items["parsed"] is False and items["items"][0]["kind"] == "grep"
    assert items["items"][0]["focusLine"] == 3 and "FROBNICATE_MODE" in items["items"][0]["snippet"]


def test_context_search_requires_a_scan(client, codebase):
    repo = register(client, codebase)
    response = client.post(f"/api/repositories/{repo['id']}/context/search", json={"query": "x"})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "scan_required"
    assert client.post("/api/repositories/missing/context/search", json={"query": "x"}).status_code == 404


def test_reader_refuses_sensitive_symlinked_and_outside_files(client, tmp_path, monkeypatch):
    root = tmp_path / "safe"
    write(root, "ok.py", "x = 1\n")
    write(root, ".env", "TOKEN=abc\n")
    repo_id = prepare(client, root, parse=False)
    db = client.app.state.db
    reader = RepoReader(db, repo_id, str(root), 10_000_000)
    assert reader.read_lines("ok.py", 1, 5) == [(1, "x = 1")]
    assert reader.read_lines(".env", 1, 5) == [] and reader.read_text(".env") is None  # sensitive
    assert reader.read_lines("../outside.txt", 1, 5) == [] and reader.read_lines("ghost.py", 1, 5) == []
    real = os.lstat

    class Link:
        st_mode = stat_module.S_IFLNK
        st_size = 3

    monkeypatch.setattr("app.ai.reader.os.lstat", lambda p: Link() if str(p).endswith("ok.py") else real(p))
    assert reader.read_lines("ok.py", 1, 5) == []
    monkeypatch.undo()
    monkeypatch.setattr("app.ai.reader.os.path.commonpath", lambda paths: "elsewhere")
    assert reader.read_lines("ok.py", 1, 5) == []


# ---- chat --------------------------------------------------------------------------------------
def test_chat_end_to_end_is_grounded_in_real_evidence(ai_client, fake, repo_id):
    fake.reply = lambda system, messages: "User extends Base and has a save method [E1]. It lives in app/models.py."
    response = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does the User class in app/models.py do?"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["agent"] == "code-intelligence" and data["status"] == "completed" and data["warnings"] == []
    assert data["steps"][0]["agentId"] == "supervisor" and "Code Intelligence" in data["steps"][0]["label"]
    assistant = data["assistantMessage"]
    assert assistant["role"] == "assistant" and "[E1]" in assistant["content"] and assistant["agent"] == "code-intelligence"
    assert assistant["files"] == [{"path": "app/models.py", "line": 1, "reason": "file named in the question: app/models.py"}]
    # the model really received the repository content, inside the untrusted-data delimiters
    sent = fake.calls[0]
    prompt = sent["messages"][-1]["content"]
    assert "<<<REPOSITORY_EVIDENCE" in prompt and "<<<END_REPOSITORY_EVIDENCE>>>" in prompt
    assert "class User(Base):" in prompt and "def save(self):" in prompt and "app/models.py:5-8" in prompt
    assert "Question: What does the User class" in prompt and "ONLY from the evidence" in sent["system"]
    assert sent["max_tokens"] == 1500


def test_hallucinated_citations_and_paths_are_flagged(ai_client, fake, repo_id):
    fake.reply = "It is defined in app/ghost.py:12 [E99]."
    data = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Where is the User class defined in app/models.py?"}).json()
    assert data["assistantMessage"]["files"] == []
    joined = " ".join(data["warnings"])
    assert "E99" in joined and "app/ghost.py" in joined and "did not cite" in joined
    assert data["assistantMessage"]["warnings"] == data["warnings"]


def test_secrets_in_code_never_reach_the_model(ai_client, fake, tmp_path):
    root = tmp_path / "leaky"
    write(root, "config.py", "API_KEY = \"sk-abcdefghijklmnopqrstuvwx\"\n\ndef connect_database():\n    password = \"hunter2hunter2\"\n    return password\n")
    repo_id = prepare(ai_client, root)
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does connect_database do?"})
    prompt = fake.last_prompt
    assert "connect_database" in prompt and "sk-abcdefghijklmnopqrstuvwx" not in prompt and "hunter2hunter2" not in prompt
    stored = json.dumps(ai_client.get(f"/api/repositories/{repo_id}/conversations").json())
    assert "hunter2" not in stored


def test_no_relevant_code_does_not_call_the_model(ai_client, fake, repo_id):
    data = ai_client.post(f"/api/repositories/{repo_id}/chat",
                          json={"message": "zzqqxx frobnicate the wibble", "agent": "code-intelligence"}).json()
    assert data["status"] == "no_evidence" and fake.calls == []
    assert "did not ask the AI model" in data["assistantMessage"]["content"]
    assert any("No relevant code found" in s["label"] for s in data["steps"])


def test_every_agent_answers_through_chat_and_direct_run(ai_client, fake, repo_id):
    questions = {
        "repository-explorer": "Give me an overview of this repository",
        "architecture-analyst": "Explain the architecture",
        "code-intelligence": "What does the helper function do?",
        "bug-investigator": "I get an error: the app crashes when saving",
        "dependency-analyst": "Which files import app/utils.py?",
        "documentation": "Generate documentation for the architecture",
    }
    for agent, question in questions.items():
        routed = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": question}).json()
        assert routed["agent"] == agent, (agent, routed["routeReason"])
        direct = ai_client.post(f"/api/repositories/{repo_id}/agents/{agent}/run", json={"question": question})
        assert direct.status_code == 200 and direct.json()["agent"] == agent and direct.json()["steps"][0]["agentId"] == "supervisor"


def test_agents_use_real_facts(ai_client, fake, repo_id):
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Give me an overview of this repository"})
    prompt = fake.last_prompt
    assert "## Languages" in prompt and "Python" in prompt and "app/main.py" in prompt
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Which files import app/utils.py?"})
    prompt = fake.last_prompt
    assert "import relationships of app/utils.py" in prompt and "is imported by: app/main.py" in prompt and "requests" in prompt
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Explain the architecture"})
    prompt = fake.last_prompt
    assert "## Modules" in prompt and "`app`" in prompt and "heuristic" in prompt


def test_unparsed_repository_still_answers_with_a_warning(ai_client, fake, codebase):
    repo_id = prepare(ai_client, codebase, parse=False)
    data = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "Which packages and imports does this use?"}).json()
    assert data["agent"] == "dependency-analyst" and any("not been parsed" in w for w in data["warnings"])


# ---- conversations -----------------------------------------------------------------------------
def test_conversation_history_is_stored_and_used(ai_client, fake, repo_id):
    first = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does the User class in app/models.py do?"}).json()
    cid = first["conversationId"]
    fake.reply = "Second answer [E1]."
    second = ai_client.post(f"/api/repositories/{repo_id}/chat",
                            json={"message": "and the save method?", "conversationId": cid}).json()
    assert second["conversationId"] == cid and second["agent"] == "code-intelligence"
    history = fake.calls[1]["messages"]
    assert [m["role"] for m in history] == ["user", "assistant", "user"]
    assert history[0]["content"].startswith("What does the User class") and "[E1]" in history[1]["content"]
    conv = ai_client.get(f"/api/conversations/{cid}").json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant", "user", "assistant"] and conv["messageCount"] == 4
    assert conv["title"] == "What does the User class in app/models.py do?"[:60]
    listing = ai_client.get(f"/api/repositories/{repo_id}/conversations").json()
    assert [(c["id"], c["messageCount"]) for c in listing] == [(cid, 4)]


def test_conversation_title_rename_delete_and_isolation(ai_client, fake, repo_id, tmp_path):
    long_question = "Explain the architecture " + "of this very large application " * 6
    cid = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": long_question}).json()["conversationId"]
    assert ai_client.get(f"/api/conversations/{cid}").json()["title"] == long_question[:60]
    renamed = ai_client.patch(f"/api/conversations/{cid}", json={"title": "  My chat  "}).json()
    assert renamed["title"] == "My chat"
    other_root = tmp_path / "other"
    write(other_root, "a.py", "def a(): pass\n")
    other_id = prepare(ai_client, other_root)
    assert ai_client.get(f"/api/repositories/{other_id}/conversations").json() == []
    mismatch = ai_client.post(f"/api/repositories/{other_id}/chat", json={"message": "hello", "conversationId": cid})
    assert mismatch.status_code == 422 and mismatch.json()["detail"]["code"] == "conversation_mismatch"
    assert ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "hi", "conversationId": "conv-nope"}).status_code == 404
    assert ai_client.delete(f"/api/conversations/{cid}").status_code == 204
    assert ai_client.get(f"/api/conversations/{cid}").status_code == 404
    assert ai_client.patch(f"/api/conversations/{cid}", json={"title": "x"}).status_code == 404
    assert ai_client.delete(f"/api/conversations/{cid}").status_code == 404
    assert ai_client.get("/api/repositories/missing/conversations").status_code == 404


def test_chat_validation_and_scan_requirement(ai_client, fake, codebase):
    repo = register(ai_client, codebase)
    unscanned = ai_client.post(f"/api/repositories/{repo['id']}/chat", json={"message": "hello"})
    assert unscanned.status_code == 409 and unscanned.json()["detail"]["code"] == "scan_required" and fake.calls == []
    scan(ai_client, repo["id"])
    assert ai_client.post(f"/api/repositories/{repo['id']}/chat", json={"message": "   "}).json()["detail"]["code"] == "empty_message"
    assert ai_client.post(f"/api/repositories/{repo['id']}/chat", json={"message": "x" * 4001}).json()["detail"]["code"] == "message_too_long"
    assert ai_client.post(f"/api/repositories/{repo['id']}/chat", json={"message": "hi", "agent": "wizard"}).json()["detail"]["code"] == "unknown_agent"
    assert ai_client.post("/api/repositories/missing/chat", json={"message": "hi"}).status_code == 404
    assert ai_client.get(f"/api/repositories/{repo['id']}/conversations").json() == []  # rejected requests store nothing


# ---- unconfigured and failing providers --------------------------------------------------------
def test_unconfigured_ai_returns_503_and_stores_nothing(client, codebase):
    repo_id = prepare(client, codebase)
    response = client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does helper do?"})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "ai_not_configured" and "CODEMIND_AI_PROVIDER" in detail["message"] and "ollama" in detail["message"]
    assert client.get(f"/api/repositories/{repo_id}/conversations").json() == []
    assert client.get(f"/api/repositories/{repo_id}/agent-runs").json() == []
    assert client.post(f"/api/repositories/{repo_id}/agents/code-intelligence/run", json={"question": "x"}).status_code == 503
    # everything that does not need a model keeps working
    assert client.get(f"/api/repositories/{repo_id}/symbols", params={"q": "helper"}).json()["total"] >= 1
    assert client.get(f"/api/repositories/{repo_id}/graph/stats").status_code == 200
    assert client.post(f"/api/repositories/{repo_id}/context/search", json={"query": "helper"}).status_code == 200


def test_provider_failure_is_persisted_and_reported(ai_client, fake, repo_id):
    fake.error = "Cannot reach Ollama at http://localhost:11434. Is it running?"
    response = ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does the helper function do?"})
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["code"] == "ai_provider_error" and "Is it running" in detail["message"] and detail["conversationId"] and detail["messageId"]
    conv = ai_client.get(f"/api/conversations/{detail['conversationId']}").json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    assert conv["messages"][1]["error"] == detail["message"] and conv["messages"][1]["content"] == ""
    runs = ai_client.get(f"/api/repositories/{repo_id}/agent-runs").json()
    assert runs[0]["status"] == "failed" and runs[0]["error"] == detail["message"]
    fake.error = None  # recovers; the failed turn is not replayed into the prompt
    ok = ai_client.post(f"/api/repositories/{repo_id}/chat",
                        json={"message": "What does the helper function do?", "conversationId": detail["conversationId"]})
    assert ok.status_code == 200
    assert [m["role"] for m in fake.calls[-1]["messages"]] == ["user", "user"]  # the failed (empty) reply is not replayed
    assert all(m["content"] for m in fake.calls[-1]["messages"])


def test_agent_run_history(ai_client, fake, repo_id):
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does the helper function do?"})
    ai_client.post(f"/api/repositories/{repo_id}/agents/repository-explorer/run", json={"question": "overview please"})
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "zzqqxx frobnicate", "agent": "code-intelligence"})
    runs = ai_client.get(f"/api/repositories/{repo_id}/agent-runs").json()
    assert [r["agent"] for r in runs] == ["code-intelligence", "repository-explorer", "code-intelligence"]
    assert runs[0]["status"] == "no_evidence" and runs[1]["status"] == "completed" and runs[1]["conversationId"] is None
    first = runs[2]
    assert first["conversationId"] and first["provider"] == "fake" and first["model"] == "fake-model"
    assert first["evidenceCount"] >= 1 and first["durationMs"] >= 0 and first["repositoryName"] == "codebase" and first["question"].startswith("What does")
    assert len(ai_client.get("/api/agent-runs", params={"limit": 2}).json()) == 2
    assert ai_client.post(f"/api/repositories/{repo_id}/agents/wizard/run", json={"question": "x"}).status_code == 404
    assert ai_client.post(f"/api/repositories/{repo_id}/agents/documentation/run", json={"question": ""}).json()["detail"]["code"] == "empty_message"


# ---- bug investigation -------------------------------------------------------------------------
def investigation_reply(**overrides):
    data = {"summary": "run() raises when the payload is empty.", "likelyRootCause": "main.py calls run({}) with an empty payload.",
            "suggestedSolution": "Pass a non-empty payload or handle the empty case before calling run.", "confidence": "high",
            "supportingEvidence": ["E1", "E99"],
            "findings": [{"title": "Explicit raise", "description": "run raises ValueError on empty input.", "severity": "high",
                          "evidenceId": "E1", "impact": "Crash at start-up", "recommendation": "Validate the input first"},
                         {"title": "Invented", "description": "x", "severity": "high", "evidenceId": "E42"}],
            "caveats": ["Only static evidence was used."]}
    data.update(overrides)
    return lambda system, messages: "Here you go:\n" + json.dumps(data)


@pytest.fixture
def bug_id(ai_client, bugrepo):
    return prepare(ai_client, bugrepo)


def test_investigation_with_stack_trace(ai_client, fake, bug_id):
    fake.reply = investigation_reply()
    response = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={
        "title": "Crash on start", "description": "The app crashes at start-up", "errorMessage": "ValueError: payload must not be empty",
        "stackTrace": TRACE})
    assert response.status_code == 200, response.text
    inv = response.json()
    assert inv["status"] == "completed" and inv["aiUsed"] is True and inv["fixApplied"] is False
    assert "No code was modified" in inv["note"] and inv["repositoryId"] == bug_id and inv["title"] == "Crash on start"
    assert inv["evidence"][0]["kind"] == "stack_frame" and inv["evidence"][0]["path"] == "app/service.py"
    assert inv["evidence"][0]["focusLine"] == 10 and inv["evidence"][0]["symbol"] == "run"
    kinds = {e["kind"] for e in inv["evidence"]}
    assert {"stack_frame", "grep", "code"} <= kinds  # frames, the literal message, and a caller of run()
    assert inv["locations"][0] == {"path": "app/service.py", "line": 10, "reason": "stack frame run at app/service.py:10"}
    assert inv["confidence"] == "high" and inv["confidenceScore"] == 85
    assert inv["rootCause"].startswith("main.py calls") and inv["suggestedSolution"].startswith("Pass a non-empty")
    assert len(inv["findings"]) == 1  # the finding that cites E42 does not exist and is dropped
    finding = inv["findings"][0]
    assert finding["file"] == "app/service.py" and finding["line"] == 10 and finding["severity"] == "high"
    assert finding["evidence"]["startLine"] == 1 and "raise ValueError" in finding["evidence"]["code"] and finding["evidence"]["highlightLines"] == [10]
    assert "10 |" not in finding["evidence"]["code"]  # plain code for display
    caveats = " ".join(inv["caveats"])
    assert "E99" in caveats and "dropped" in caveats and "Only static evidence" in caveats
    assert [t["stageId"] for t in inv["timeline"]][:3] == ["input", "frames", "search"] and inv["timeline"][-1]["stageId"] == "done"
    assert inv["recommendations"][0].startswith("Pass a non-empty") and inv["createdAt"] <= inv["completedAt"]
    prompt = fake.last_prompt
    assert "<<<REPOSITORY_EVIDENCE" in prompt and "raise ValueError" in prompt and "payload must not be empty" in prompt


def test_confidence_is_capped_by_evidence_and_models_can_only_lower_it(ai_client, fake, bug_id):
    fake.reply = investigation_reply(supportingEvidence=["E1"], confidence="high")
    weak = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"description": "parse_payload_data returns the wrong value"}).json()
    assert weak["status"] == "completed" and weak["confidence"] == "medium" and weak["confidenceScore"] == 60  # symbol match only
    assert not any(e["kind"] == "stack_frame" for e in weak["evidence"])
    fake.reply = investigation_reply(supportingEvidence=["E1"], confidence="low")
    lowered = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"errorMessage": "ValueError: payload must not be empty", "stackTrace": TRACE}).json()
    assert lowered["confidence"] == "low"
    fake.reply = investigation_reply(supportingEvidence=["E77"], confidence="high")
    uncited = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"stackTrace": TRACE}).json()
    assert uncited["confidence"] == "low" and any("did not cite any valid evidence" in c for c in uncited["caveats"])


def test_investigation_validates_model_text(ai_client, fake, bug_id):
    fake.reply = investigation_reply(likelyRootCause="The bug is in app/imaginary.py at line 4", supportingEvidence=["E1"])
    inv = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"stackTrace": TRACE}).json()
    assert any("app/imaginary.py" in c and "not in the repository" in c for c in inv["caveats"])
    fake.reply = "Sorry, I cannot produce JSON, but the bug is probably in service.py."
    plain = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"stackTrace": TRACE}).json()
    assert plain["status"] == "completed" and plain["confidence"] == "low" and "service.py" in plain["summary"]
    assert any("structured JSON" in c for c in plain["caveats"]) and plain["findings"] and plain["fixApplied"] is False


def test_investigation_without_ai_returns_the_located_evidence(client, bugrepo):
    repo_id = prepare(client, bugrepo)
    response = client.post(f"/api/repositories/{repo_id}/investigations", json={"stackTrace": TRACE, "description": "crash"})
    assert response.status_code == 200
    inv = response.json()
    assert inv["status"] == "evidence_only" and inv["aiUsed"] is False and inv["fixApplied"] is False
    assert "CODEMIND_AI_PROVIDER" in inv["message"] and "needs an AI provider" in inv["summary"]
    assert inv["rootCause"] is None and inv["suggestedSolution"] is None and inv["confidenceScore"] == 0
    assert inv["locations"][0]["path"] == "app/service.py" and inv["findings"]
    assert all(f["severity"] == "informational" and "not confirmed" in f["impact"] or "Not established" in f["impact"] for f in inv["findings"])
    assert client.get(f"/api/repositories/{repo_id}/agent-runs").json()[0]["status"] == "evidence_only"


def test_investigation_without_evidence_does_not_call_the_model(ai_client, fake, bug_id):
    inv = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"description": "Something odd happens sometimes"}).json()
    assert inv["status"] == "no_evidence" and fake.calls == [] and inv["evidence"] == [] and inv["findings"] == []
    assert "No code in the repository index matches" in inv["summary"]


def test_investigation_provider_failure_is_persisted(ai_client, fake, bug_id):
    fake.error = "Ollama returned HTTP 500."
    inv = ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"stackTrace": TRACE}).json()
    assert inv["status"] == "failed" and inv["failureReason"] == "Ollama returned HTTP 500." and inv["aiUsed"] is False
    assert inv["locations"] and inv["findings"]  # the evidence survives the failure
    stored = ai_client.get(f"/api/investigations/{inv['id']}").json()
    assert stored["status"] == "failed" and stored["id"] == inv["id"]
    assert ai_client.get(f"/api/repositories/{bug_id}/agent-runs").json()[0]["status"] == "failed"


def test_investigation_hints_and_stored_history(ai_client, fake, bug_id):
    fake.reply = investigation_reply(supportingEvidence=["E1"])
    first = ai_client.post(f"/api/repositories/{bug_id}/investigations",
                           json={"description": "load behaves oddly", "filePath": "app/service.py", "affectedModule": "app"}).json()
    assert first["evidence"][0]["kind"] == "file" and first["filePath"] == "app/service.py" and first["affectedModule"] == "app"
    missing_hint = ai_client.post(f"/api/repositories/{bug_id}/investigations",
                                  json={"stackTrace": TRACE, "filePath": "app/nothing.py"}).json()
    assert any("app/nothing.py" in c and "not in the scanned repository" in c for c in missing_hint["caveats"])
    listing = ai_client.get(f"/api/repositories/{bug_id}/investigations").json()
    assert [i["id"] for i in listing] == [missing_hint["id"], first["id"]]
    assert ai_client.get(f"/api/investigations/{first['id']}").json()["title"] == first["title"]
    assert ai_client.delete(f"/api/investigations/{first['id']}").status_code == 204
    assert ai_client.get(f"/api/investigations/{first['id']}").status_code == 404
    assert ai_client.delete(f"/api/investigations/{first['id']}").status_code == 404


def test_investigation_input_validation(ai_client, fake, bug_id, codebase):
    assert ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"title": "only a title"}).json()["detail"]["code"] == "empty_report"
    assert ai_client.post(f"/api/repositories/{bug_id}/investigations", json={"stackTrace": "x" * 20001}).json()["detail"]["code"] == "input_too_long"
    assert ai_client.get("/api/repositories/missing/investigations").status_code == 404
    other = register(ai_client, codebase)
    unscanned = ai_client.post(f"/api/repositories/{other['id']}/investigations", json={"description": "x"})
    assert unscanned.status_code == 409 and unscanned.json()["detail"]["code"] == "scan_required" and fake.calls == []


def test_chat_bug_question_runs_the_investigator_and_saves_it(ai_client, fake, bug_id):
    fake.reply = investigation_reply(supportingEvidence=["E1"])
    data = ai_client.post(f"/api/repositories/{bug_id}/chat", json={"message": TRACE}).json()
    assert data["agent"] == "bug-investigator" and data["status"] == "completed"
    content = data["assistantMessage"]["content"]
    assert "Likely root cause" in content and "Suggested solution" in content and "No code was modified" in content
    assert data["assistantMessage"]["files"][0]["path"] == "app/service.py"
    assert len(ai_client.get(f"/api/repositories/{bug_id}/investigations").json()) == 1


# ---- repository removal ------------------------------------------------------------------------
def test_deleting_a_repository_removes_all_ai_data(ai_client, fake, bugrepo, settings):
    import sqlite3

    repo_id = prepare(ai_client, bugrepo)
    fake.reply = investigation_reply(supportingEvidence=["E1"])
    ai_client.post(f"/api/repositories/{repo_id}/chat", json={"message": "What does load do?"})
    ai_client.post(f"/api/repositories/{repo_id}/investigations", json={"stackTrace": TRACE})
    ai_client.post(f"/api/repositories/{repo_id}/documentation", json={"type": "project-overview"})
    assert ai_client.delete(f"/api/repositories/{repo_id}").status_code == 204
    con = sqlite3.connect(settings.db_path)
    for table in ("conversations", "messages", "agent_runs", "investigations", "documents", "symbols", "files"):
        assert con.execute(f"select count(*) from {table}").fetchone()[0] == 0, table
    con.close()
