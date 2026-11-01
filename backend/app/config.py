"""Runtime settings. Everything is overridable through environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


AI_PROVIDERS = ("ollama", "openai", "anthropic", "openai_compatible")
DEFAULT_ENDPOINTS = {
    "ollama": "http://localhost:11434",
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
}
_DISABLED = {"", "none", "off", "disabled", "false", "0"}


@dataclass(frozen=True)
class AISettings:
    """Which model answers the AI features. Everything comes from environment variables (or backend/.env)."""

    provider: str = ""  # "" = disabled
    model: str = ""
    endpoint: str = ""
    api_key: str = field(default="", repr=False)  # never logged, never returned by the API
    timeout: float = 120.0
    max_tokens: int = 1500
    temperature: float = 0.2
    context_chars: int = 16000

    def problems(self) -> list[str]:
        """What is missing for the AI features to work (empty list = configured)."""
        if not self.provider:
            return ["CODEMIND_AI_PROVIDER is not set"]
        if self.provider not in AI_PROVIDERS:
            return [f"unknown provider '{self.provider}' (use one of: {', '.join(AI_PROVIDERS)})"]
        missing = []
        if not self.model:
            missing.append("CODEMIND_AI_MODEL is not set")
        if self.provider in ("openai", "anthropic") and not self.api_key:
            missing.append("CODEMIND_AI_API_KEY is not set")
        if self.provider == "openai_compatible" and not self.endpoint:
            missing.append("CODEMIND_AI_ENDPOINT is not set")
        return missing

    @property
    def configured(self) -> bool:
        return not self.problems()


def ai_settings_from_env(env) -> AISettings:
    provider = (env.get("CODEMIND_AI_PROVIDER") or "").strip().lower()
    if provider in _DISABLED:
        provider = ""
    key = (env.get("CODEMIND_AI_API_KEY") or "").strip()
    if not key and provider == "openai":
        key = (env.get("OPENAI_API_KEY") or "").strip()
    if not key and provider == "anthropic":
        key = (env.get("ANTHROPIC_API_KEY") or "").strip()

    def number(name, default, cast):
        try:
            return cast(env[name]) if env.get(name) else default
        except ValueError:
            return default

    endpoint = (env.get("CODEMIND_AI_ENDPOINT") or "").strip() or DEFAULT_ENDPOINTS.get(provider, "")
    return AISettings(
        provider=provider, model=(env.get("CODEMIND_AI_MODEL") or "").strip(), endpoint=endpoint.rstrip("/"),
        api_key=key, timeout=number("CODEMIND_AI_TIMEOUT", 120.0, float),
        max_tokens=number("CODEMIND_AI_MAX_TOKENS", 1500, int),
        temperature=number("CODEMIND_AI_TEMPERATURE", 0.2, float),
        context_chars=number("CODEMIND_AI_CONTEXT_CHARS", 16000, int),
    )


def load_dotenv(path: Path, environ=None) -> dict[str, str]:
    """Minimal .env reader: KEY=VALUE lines, # comments, optional quotes. Real environment variables win.
    Returns the values that were applied."""
    environ = os.environ if environ is None else environ
    applied: dict[str, str] = {}
    try:
        text = Path(path).read_text(encoding="utf-8-sig")
    except OSError:
        return applied
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        if key and key not in environ:
            environ[key] = value
            applied[key] = value
    return applied


@dataclass(frozen=True)
class Settings:
    db_path: Path = BACKEND_DIR / "data" / "codemind.db"
    #: gitignore-style patterns applied to every scan, on top of the built-in exclusions.
    extra_excludes: tuple[str, ...] = ()
    #: files larger than this are left out of the inventory.
    max_file_bytes: int = 10 * 1024 * 1024
    #: manifests/.gitignore files larger than this are not parsed.
    max_parse_bytes: int = 1024 * 1024
    #: safety valve against runaway scans (e.g. a drive full of files registered by mistake).
    max_files_per_scan: int = 500_000
    scan_workers: int = 2
    #: Stage 3: files larger than this are recorded as skipped instead of parsed.
    parse_max_file_bytes: int = 1_000_000
    parse_workers: int = 1
    parse_batch: int = 25
    cors_origins: tuple[str, ...] = field(
        default=("http://localhost:5173", "http://127.0.0.1:5173")
    )
    ai: AISettings = field(default_factory=AISettings)


def load_settings(env_file: Path | None = BACKEND_DIR / ".env") -> Settings:
    if env_file is not None:
        load_dotenv(env_file)
    env = os.environ
    base = Settings()
    split = lambda value: tuple(p.strip() for p in value.split(",") if p.strip())  # noqa: E731
    return Settings(
        db_path=Path(env["CODEMIND_DB"]) if env.get("CODEMIND_DB") else base.db_path,
        extra_excludes=split(env.get("CODEMIND_EXCLUDES", "")),
        cors_origins=split(env["CODEMIND_CORS"]) if env.get("CODEMIND_CORS") else base.cors_origins,
        max_files_per_scan=int(env.get("CODEMIND_MAX_FILES", base.max_files_per_scan)),
        ai=ai_settings_from_env(env),
    )
