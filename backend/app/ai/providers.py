"""LLM providers over plain HTTP (httpx). This is the only module that knows about vendor APIs:
everything else talks to the LLMProvider interface. Errors are written to be shown to users and never
contain the API key."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol
from urllib.parse import urlparse

import httpx

from ..config import AISettings


class ProviderError(Exception):
    """The provider could not answer (unreachable, rejected the request, bad response)."""


class ProviderNotConfigured(ProviderError):
    """No usable AI configuration."""


@dataclass(frozen=True)
class LLMResponse:
    text: str
    model: str


class LLMProvider(Protocol):
    name: str
    model: str

    def complete(self, system: str, messages: list[dict], max_tokens: int, temperature: float) -> LLMResponse: ...

    def check(self) -> str:
        """Verify the connection; returns a short human-readable detail or raises ProviderError."""


def config_message(ai: AISettings) -> str:
    """What to tell the user when the AI features are not usable."""
    problems = "; ".join(ai.problems())
    return (
        f"No AI provider is configured ({problems}). Set CODEMIND_AI_PROVIDER (ollama, openai, anthropic or "
        "openai_compatible) and CODEMIND_AI_MODEL in backend/.env or the environment, plus CODEMIND_AI_API_KEY "
        "for hosted providers. Example for a local model: CODEMIND_AI_PROVIDER=ollama and CODEMIND_AI_MODEL=llama3.1. "
        "Repository scanning, code parsing and dependency analysis work without it."
    )


def host_only(endpoint: str) -> str:
    """scheme://host[:port] only: paths and credentials in an endpoint URL are never exposed."""
    parsed = urlparse(endpoint)
    if not parsed.hostname:
        return ""
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}"


class _HttpProvider:
    name = ""
    label = ""

    def __init__(self, ai: AISettings, transport: httpx.BaseTransport | None = None):
        self.model = ai.model
        self.endpoint = ai.endpoint.rstrip("/")
        self._key = ai.api_key
        self._timeout = ai.timeout
        self._transport = transport

    # ---- plumbing ----------------------------------------------------------------------
    def _clean(self, text: str) -> str:
        text = (text or "").strip().replace("\n", " ")[:300]
        return text.replace(self._key, "***") if self._key else text

    def _request(self, method: str, url: str, **kwargs) -> dict:
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.request(method, url, **kwargs)
        except httpx.ConnectError:
            raise ProviderError(self._unreachable()) from None
        except httpx.TimeoutException:
            raise ProviderError(
                f"{self.label} did not answer within {int(self._timeout)} seconds. "
                "Try a smaller model or raise CODEMIND_AI_TIMEOUT."
            ) from None
        except httpx.HTTPError as exc:
            raise ProviderError(f"Could not talk to {self.label}: {self._clean(type(exc).__name__)}.") from None
        if response.status_code >= 400:
            raise ProviderError(self._http_error(response))
        try:
            data = response.json()
        except ValueError:
            raise ProviderError(f"{self.label} returned a response that is not valid JSON.") from None
        if not isinstance(data, dict):
            raise ProviderError(f"{self.label} returned an unexpected response.")
        return data

    def _unreachable(self) -> str:
        return f"Cannot reach {self.label} at {host_only(self.endpoint)}. Check CODEMIND_AI_ENDPOINT and your network."

    def _detail(self, response: httpx.Response) -> str:
        try:
            body = response.json()
        except ValueError:
            return self._clean(response.text)
        error = body.get("error") if isinstance(body, dict) else None
        if isinstance(error, dict):
            return self._clean(str(error.get("message", "")))
        return self._clean(str(error or body))

    def _http_error(self, response: httpx.Response) -> str:
        status = response.status_code
        if status in (401, 403):
            return f"{self.label} rejected the credentials (HTTP {status}): authentication failed. Check CODEMIND_AI_API_KEY."
        if status == 404:
            return f"{self.label} returned 404: the model or endpoint was not found. Check CODEMIND_AI_MODEL and CODEMIND_AI_ENDPOINT."
        if status == 429:
            return f"{self.label} is rate limiting requests (HTTP 429). Wait a moment and try again."
        detail = self._detail(response)
        return f"{self.label} returned HTTP {status}" + (f": {detail}" if detail else ".")

    def check(self) -> str:  # pragma: no cover - overridden
        raise NotImplementedError


class OllamaProvider(_HttpProvider):
    name = "ollama"
    label = "Ollama"

    def _unreachable(self) -> str:
        return f"Cannot reach Ollama at {host_only(self.endpoint)}. Is it running? Start it with `ollama serve`."

    def _http_error(self, response: httpx.Response) -> str:
        if response.status_code == 404:
            return f"Ollama does not have the model '{self.model}'. Install it with: ollama pull {self.model}"
        return super()._http_error(response)

    def complete(self, system, messages, max_tokens, temperature) -> LLMResponse:
        payload = {
            "model": self.model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        data = self._request("POST", f"{self.endpoint}/api/chat", json=payload)
        text = (data.get("message") or {}).get("content") if isinstance(data.get("message"), dict) else None
        if not isinstance(text, str) or not text.strip():
            raise ProviderError("Ollama returned an empty answer.")
        return LLMResponse(text.strip(), data.get("model") or self.model)

    def check(self) -> str:
        data = self._request("GET", f"{self.endpoint}/api/tags")
        names = [m.get("name", "") for m in data.get("models", []) if isinstance(m, dict)]
        if not any(n == self.model or n == f"{self.model}:latest" or n.split(":")[0] == self.model for n in names):
            raise ProviderError(
                f"Ollama is running but the model '{self.model}' is not installed. Run: ollama pull {self.model}"
            )
        return f"Ollama is running and model '{self.model}' is installed."


class OpenAIProvider(_HttpProvider):
    """OpenAI and any server that speaks the same chat-completions protocol (LM Studio, vLLM, OpenRouter, Groq...)."""

    name = "openai"
    label = "OpenAI"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._key}"} if self._key else {}

    def complete(self, system, messages, max_tokens, temperature) -> LLMResponse:
        payload = {
            "model": self.model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        data = self._request("POST", f"{self.endpoint}/chat/completions", json=payload, headers=self._headers())
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError(f"{self.label} returned a response without an answer.") from None
        if not isinstance(text, str) or not text.strip():
            raise ProviderError(f"{self.label} returned an empty answer.")
        return LLMResponse(text.strip(), data.get("model") or self.model)

    def check(self) -> str:
        self._request("GET", f"{self.endpoint}/models", headers=self._headers())
        return f"{self.label} endpoint is reachable and accepted the credentials."


class OpenAICompatibleProvider(OpenAIProvider):
    name = "openai_compatible"
    label = "The OpenAI-compatible server"


class AnthropicProvider(_HttpProvider):
    name = "anthropic"
    label = "Anthropic"

    def _url(self) -> str:
        base = self.endpoint[:-3] if self.endpoint.endswith("/v1") else self.endpoint
        return f"{base}/v1/messages"

    def _headers(self) -> dict:
        return {"x-api-key": self._key, "anthropic-version": "2023-06-01"}

    def complete(self, system, messages, max_tokens, temperature) -> LLMResponse:
        payload = {"model": self.model, "max_tokens": max_tokens, "temperature": temperature, "messages": messages}
        if system:
            payload["system"] = system
        data = self._request("POST", self._url(), json=payload, headers=self._headers())
        blocks = data.get("content")
        text = "".join(b.get("text", "") for b in blocks if isinstance(b, dict)) if isinstance(blocks, list) else ""
        if not text.strip():
            raise ProviderError("Anthropic returned an empty answer.")
        return LLMResponse(text.strip(), data.get("model") or self.model)

    def check(self) -> str:
        self.complete("", [{"role": "user", "content": "ping"}], 1, 0.0)
        return "Anthropic accepted a test request with the configured key and model."


#: name -> factory. Adding a provider means adding one entry here.
PROVIDERS: dict[str, Callable[..., LLMProvider]] = {
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
    "openai_compatible": OpenAICompatibleProvider,
    "anthropic": AnthropicProvider,
}


def build_provider(ai: AISettings, transport: httpx.BaseTransport | None = None) -> LLMProvider:
    if not ai.configured:
        raise ProviderNotConfigured(config_message(ai))
    return PROVIDERS[ai.provider](ai, transport=transport)
