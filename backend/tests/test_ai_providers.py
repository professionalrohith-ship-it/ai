import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.providers import (
    PROVIDERS, ProviderError, ProviderNotConfigured, build_provider, config_message, host_only,
)
from app.config import AI_PROVIDERS, AISettings, ai_settings_from_env, load_dotenv, load_settings
from app.main import create_app

from .ai_helpers import ai_client, fake  # noqa: F401  (fixtures)

KEY = "sk-test-SECRET-key-123456"


def ai(provider, **kw):
    base = dict(provider=provider, model="m1", endpoint={"ollama": "http://localhost:11434", "openai": "https://api.openai.com/v1",
                                                         "anthropic": "https://api.anthropic.com", "openai_compatible": "http://lm.local:1234/v1"}[provider],
                api_key=KEY if provider in ("openai", "anthropic") else "")
    base.update(kw)
    return AISettings(**base)


def mock(handler):
    seen = []

    def wrapper(request):
        seen.append(request)
        return handler(request)

    return httpx.MockTransport(wrapper), seen


# ---- settings and .env -------------------------------------------------------------------------
@pytest.mark.parametrize(
    "env,configured",
    [
        ({}, False),
        ({"CODEMIND_AI_PROVIDER": "none"}, False),
        ({"CODEMIND_AI_PROVIDER": "ollama"}, False),  # model missing
        ({"CODEMIND_AI_PROVIDER": "ollama", "CODEMIND_AI_MODEL": "llama3.1"}, True),
        ({"CODEMIND_AI_PROVIDER": "OpenAI", "CODEMIND_AI_MODEL": "gpt"}, False),  # key missing
        ({"CODEMIND_AI_PROVIDER": "openai", "CODEMIND_AI_MODEL": "gpt", "CODEMIND_AI_API_KEY": "k"}, True),
        ({"CODEMIND_AI_PROVIDER": "openai", "CODEMIND_AI_MODEL": "gpt", "OPENAI_API_KEY": "k"}, True),
        ({"CODEMIND_AI_PROVIDER": "anthropic", "CODEMIND_AI_MODEL": "c", "ANTHROPIC_API_KEY": "k"}, True),
        ({"CODEMIND_AI_PROVIDER": "anthropic", "CODEMIND_AI_MODEL": "c", "OPENAI_API_KEY": "k"}, False),
        ({"CODEMIND_AI_PROVIDER": "openai_compatible", "CODEMIND_AI_MODEL": "m"}, False),  # endpoint missing
        ({"CODEMIND_AI_PROVIDER": "openai_compatible", "CODEMIND_AI_MODEL": "m", "CODEMIND_AI_ENDPOINT": "http://x/v1"}, True),
        ({"CODEMIND_AI_PROVIDER": "skynet", "CODEMIND_AI_MODEL": "m"}, False),
    ],
)
def test_configured_rules(env, configured):
    assert ai_settings_from_env(env).configured is configured


def test_settings_defaults_and_overrides():
    s = ai_settings_from_env({"CODEMIND_AI_PROVIDER": "ollama", "CODEMIND_AI_MODEL": "m", "CODEMIND_AI_TIMEOUT": "30",
                              "CODEMIND_AI_MAX_TOKENS": "bad", "CODEMIND_AI_TEMPERATURE": "0.7", "CODEMIND_AI_CONTEXT_CHARS": "9000"})
    assert s.endpoint == "http://localhost:11434" and s.timeout == 30.0 and s.max_tokens == 1500  # invalid number -> default
    assert s.temperature == 0.7 and s.context_chars == 9000
    assert ai_settings_from_env({"CODEMIND_AI_PROVIDER": "openai", "CODEMIND_AI_ENDPOINT": "https://proxy/v1/"}).endpoint == "https://proxy/v1"
    assert ai_settings_from_env({"CODEMIND_AI_PROVIDER": "anthropic"}).endpoint == "https://api.anthropic.com"


def test_api_key_never_appears_in_repr():
    assert KEY not in repr(ai("openai")) and KEY not in str(ai("openai"))


def test_dotenv_parsing_and_precedence(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment\n\nCODEMIND_AI_PROVIDER=ollama\nCODEMIND_AI_MODEL = \"llama3.1\"\nexport CODEMIND_AI_ENDPOINT='http://h:1'\n"
        "CODEMIND_AI_TIMEOUT=45 # trailing note\nALREADY=from_file\nnot a line\nEMPTY=\n", encoding="utf-8")
    environ = {"ALREADY": "from_environment"}
    applied = load_dotenv(env_file, environ)
    assert environ["CODEMIND_AI_MODEL"] == "llama3.1" and environ["CODEMIND_AI_ENDPOINT"] == "http://h:1"
    assert environ["CODEMIND_AI_TIMEOUT"] == "45" and environ["EMPTY"] == ""
    assert environ["ALREADY"] == "from_environment" and "ALREADY" not in applied  # real environment wins
    assert load_dotenv(tmp_path / "missing.env", {}) == {}


def test_load_settings_reads_env_file_without_touching_real_environment(tmp_path, monkeypatch):
    monkeypatch.setattr(os, "environ", {"PATH": os.environ.get("PATH", "")})
    env_file = tmp_path / ".env"
    env_file.write_text("CODEMIND_AI_PROVIDER=ollama\nCODEMIND_AI_MODEL=qwen2.5-coder\nCODEMIND_DB=" + str(tmp_path / "x.db") + "\n")
    settings = load_settings(env_file)
    assert settings.ai.configured and settings.ai.model == "qwen2.5-coder" and settings.db_path == tmp_path / "x.db"
    assert load_settings(None).ai.provider == "ollama"  # already loaded into the (patched) environment
    monkeypatch.setattr(os, "environ", {})
    assert load_settings(tmp_path / "nope.env").ai.configured is False


# ---- provider request shapes -------------------------------------------------------------------
def test_ollama_request_and_response():
    transport, seen = mock(lambda r: httpx.Response(200, json={"model": "m1", "message": {"role": "assistant", "content": " hi "}}))
    provider = build_provider(ai("ollama"), transport)
    reply = provider.complete("be brief", [{"role": "user", "content": "hello"}], 50, 0.1)
    assert reply.text == "hi" and reply.model == "m1"
    request = seen[0]
    assert str(request.url) == "http://localhost:11434/api/chat" and "authorization" not in request.headers
    body = json.loads(request.content)
    assert body["model"] == "m1" and body["stream"] is False
    assert body["messages"] == [{"role": "system", "content": "be brief"}, {"role": "user", "content": "hello"}]
    assert body["options"] == {"temperature": 0.1, "num_predict": 50}


def test_openai_request_and_response():
    transport, seen = mock(lambda r: httpx.Response(200, json={"model": "gpt-x", "choices": [{"message": {"content": "ok"}}]}))
    provider = build_provider(ai("openai"), transport)
    assert provider.complete("sys", [{"role": "user", "content": "q"}], 77, 0.3).text == "ok"
    request = seen[0]
    assert str(request.url) == "https://api.openai.com/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(request.content)
    assert body["max_tokens"] == 77 and body["temperature"] == 0.3 and body["messages"][0] == {"role": "system", "content": "sys"}


def test_openai_compatible_uses_custom_endpoint_and_optional_key():
    transport, seen = mock(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}))
    provider = build_provider(ai("openai_compatible"), transport)
    provider.complete("", [{"role": "user", "content": "q"}], 10, 0.0)
    assert str(seen[0].url) == "http://lm.local:1234/v1/chat/completions" and "authorization" not in seen[0].headers
    assert json.loads(seen[0].content)["messages"] == [{"role": "user", "content": "q"}]  # no empty system message
    keyed = build_provider(ai("openai_compatible", api_key="local-key"), transport)
    keyed.complete("", [{"role": "user", "content": "q"}], 10, 0.0)
    assert seen[-1].headers["authorization"] == "Bearer local-key"


@pytest.mark.parametrize("endpoint", ["https://api.anthropic.com", "https://api.anthropic.com/v1", "https://api.anthropic.com/"])
def test_anthropic_request_and_response(endpoint):
    transport, seen = mock(lambda r: httpx.Response(200, json={"model": "claude-x", "content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}))
    provider = build_provider(ai("anthropic", endpoint=endpoint), transport)
    reply = provider.complete("sys", [{"role": "user", "content": "q"}], 99, 0.2)
    assert reply.text == "ab" and reply.model == "claude-x"
    request = seen[0]
    assert str(request.url) == "https://api.anthropic.com/v1/messages"
    assert request.headers["x-api-key"] == KEY and request.headers["anthropic-version"] == "2023-06-01"
    body = json.loads(request.content)
    assert body["system"] == "sys" and body["max_tokens"] == 99 and body["messages"] == [{"role": "user", "content": "q"}]


def test_registry_covers_every_configurable_provider():
    assert set(PROVIDERS) == set(AI_PROVIDERS)


# ---- errors ------------------------------------------------------------------------------------
def complete(provider_name, handler):
    transport, _ = mock(handler)
    return build_provider(ai(provider_name), transport).complete("", [{"role": "user", "content": "q"}], 10, 0.0)


def test_unreachable_ollama_message():
    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(ProviderError) as info:
        complete("ollama", refuse)
    assert "Cannot reach Ollama at http://localhost:11434" in str(info.value) and "Is it running" in str(info.value)


def test_unreachable_hosted_provider_names_only_the_host():
    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(ProviderError) as info:
        complete("openai", refuse)
    assert "api.openai.com" in str(info.value) and KEY not in str(info.value)


@pytest.mark.parametrize("status", [401, 403])
def test_authentication_failure_does_not_leak_the_key(status):
    with pytest.raises(ProviderError) as info:
        complete("openai", lambda r: httpx.Response(status, json={"error": {"message": f"bad key {KEY}"}}))
    assert "authentication failed" in str(info.value) and KEY not in str(info.value)


def test_missing_ollama_model_suggests_pull():
    with pytest.raises(ProviderError) as info:
        complete("ollama", lambda r: httpx.Response(404, json={"error": "model not found"}))
    assert "ollama pull m1" in str(info.value)


def test_rate_limit_server_error_and_key_scrubbing():
    with pytest.raises(ProviderError, match="rate limiting"):
        complete("anthropic", lambda r: httpx.Response(429, json={}))
    with pytest.raises(ProviderError) as info:
        complete("openai", lambda r: httpx.Response(500, json={"error": {"message": f"upstream exploded for {KEY}"}}))
    assert "HTTP 500" in str(info.value) and KEY not in str(info.value) and "***" in str(info.value)


def test_timeout_and_malformed_responses():
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ProviderError, match="did not answer within"):
        complete("ollama", slow)
    with pytest.raises(ProviderError, match="not valid JSON"):
        complete("openai", lambda r: httpx.Response(200, text="<html>nope</html>"))
    with pytest.raises(ProviderError, match="without an answer"):
        complete("openai", lambda r: httpx.Response(200, json={"choices": []}))
    with pytest.raises(ProviderError, match="empty answer"):
        complete("ollama", lambda r: httpx.Response(200, json={"message": {"content": "  "}}))
    with pytest.raises(ProviderError, match="empty answer"):
        complete("anthropic", lambda r: httpx.Response(200, json={"content": []}))


def test_check_methods():
    ok, seen = mock(lambda r: httpx.Response(200, json={"models": [{"name": "m1:latest"}]}))
    assert "installed" in build_provider(ai("ollama"), ok).check() and str(seen[0].url).endswith("/api/tags")
    with pytest.raises(ProviderError, match="not installed"):
        build_provider(ai("ollama", model="other"), ok).check()
    models, seen = mock(lambda r: httpx.Response(200, json={"data": []}))
    assert "reachable" in build_provider(ai("openai"), models).check() and str(seen[0].url).endswith("/models")
    ping, seen = mock(lambda r: httpx.Response(200, json={"content": [{"type": "text", "text": "p"}]}))
    assert "accepted" in build_provider(ai("anthropic"), ping).check() and json.loads(seen[0].content)["max_tokens"] == 1


def test_build_provider_unconfigured():
    with pytest.raises(ProviderNotConfigured) as info:
        build_provider(AISettings())
    message = str(info.value)
    for needle in ("CODEMIND_AI_PROVIDER", "CODEMIND_AI_MODEL", "CODEMIND_AI_API_KEY", "ollama", "scanning, code parsing"):
        assert needle in message
    assert config_message(AISettings(provider="openai", model="x")).count("CODEMIND_AI_API_KEY is not set") == 1


def test_host_only_strips_credentials_and_paths():
    assert host_only("https://user:pw@example.com:8443/v1/secret?key=abc") == "https://example.com:8443"
    assert host_only("not a url") == ""


# ---- status endpoint ---------------------------------------------------------------------------
def test_status_unconfigured(client):
    data = client.get("/api/ai/status").json()
    assert data["configured"] is False and data["provider"] is None and data["reachable"] is None
    assert "CODEMIND_AI_PROVIDER" in data["message"] and "work without it" in data["message"]
    assert client.get("/api/ai/status", params={"check": "true"}).json()["reachable"] is None  # nothing to check


def test_status_configured_never_exposes_the_key_or_url_secrets(settings):
    from dataclasses import replace

    configured = replace(settings, ai=ai("openai", endpoint="https://user:pw@api.example.com:8443/v1/secret?token=zzz"))
    with TestClient(create_app(configured)) as client:
        transport, _ = mock(lambda r: httpx.Response(200, json={"data": []}))
        client.app.state.ai._transport = transport
        body = client.get("/api/ai/status", params={"check": "true"})
        data = body.json()
        assert data["configured"] is True and data["provider"] == "openai" and data["model"] == "m1"
        assert data["endpoint"] == "https://api.example.com:8443" and data["reachable"] is True
        assert KEY not in body.text and "pw" not in data["endpoint"] and "zzz" not in body.text


def test_status_check_reports_unreachable_provider(settings):
    from dataclasses import replace

    with TestClient(create_app(replace(settings, ai=ai("ollama")))) as client:
        def refuse(request):
            raise httpx.ConnectError("refused", request=request)

        transport, _ = mock(refuse)
        client.app.state.ai._transport = transport
        data = client.get("/api/ai/status", params={"check": "true"}).json()
        assert data["configured"] is True and data["reachable"] is False and "Is it running" in data["detail"]


def test_status_with_injected_provider(ai_client):
    data = ai_client.get("/api/ai/status", params={"check": "true"}).json()
    assert data["configured"] and data["provider"] == "fake" and data["reachable"] is True and data["endpoint"] is None
