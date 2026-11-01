"""AIService: the single entry point the API uses for chat, agents, investigations and documentation."""
from __future__ import annotations

import re
import time

import httpx

from ..config import Settings
from ..db import Database
from ..errors import ApiError
from ..intelligence.queries import IntelligenceQueries
from ..queries import Queries
from ..repo_service import RepositoryRow, RepositoryService, utcnow
from ..views import require_scanned
from . import docs
from .agents import AGENTS, PROMPTS, gather
from .context import AIContext, build_context
from .evidence import format_evidence_block, ground_answer
from .investigator import investigate
from .providers import LLMProvider, ProviderError, ProviderNotConfigured, build_provider, config_message, host_only
from .stacktrace import parse_frames
from .store import AIStore
from .supervisor import Supervisor

MAX_MESSAGE = 4000
HISTORY_MESSAGES = 6
NO_EVIDENCE_ANSWER = ("I could not find anything in the repository index that is relevant to this question, so I did "
                      "not ask the AI model (it would only be guessing). Try naming a file, function or class, or make "
                      "sure the repository has been scanned and parsed.")


class AIService:
    def __init__(self, settings: Settings, db: Database, repos: RepositoryService, queries: Queries,
                 intel: IntelligenceQueries, provider: LLMProvider | None = None,
                 transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.db = db
        self.repos = repos
        self.queries = queries
        self.intel = intel
        self.store = AIStore(db)
        self.supervisor = Supervisor()
        self._injected = provider
        self._transport = transport

    # ---- provider ----------------------------------------------------------------------
    def provider(self) -> LLMProvider | None:
        """The configured provider, or None when AI is not configured."""
        if self._injected is not None:
            return self._injected
        try:
            return build_provider(self.settings.ai, self._transport)
        except ProviderNotConfigured:
            return None

    def require_provider(self) -> LLMProvider:
        provider = self.provider()
        if provider is None:
            raise ApiError(503, "ai_not_configured", config_message(self.settings.ai))
        return provider

    def status(self, check: bool = False) -> dict:
        provider = self.provider()
        ai = self.settings.ai
        data = {"configured": provider is not None, "provider": provider.name if provider else (ai.provider or None),
                "model": provider.model if provider else (ai.model or None),
                "endpoint": host_only(ai.endpoint) if ai.endpoint and self._injected is None else None,
                "message": config_message(ai) if provider is None else
                f"AI provider '{provider.name}' with model '{provider.model}' is configured.",
                "reachable": None, "detail": None}
        if check and provider is not None:
            try:
                data["detail"] = provider.check()
                data["reachable"] = True
            except ProviderError as exc:
                data["reachable"] = False
                data["detail"] = str(exc)
        return data

    # ---- context -----------------------------------------------------------------------
    def context(self, repo_id: str) -> AIContext:
        repo = require_scanned(self.repos, repo_id)
        return build_context(self.db, repo, self.queries, self.intel, self.repos, self.settings)

    def retrieve(self, repo_id: str, query: str, limit: int) -> dict:
        ctx = self.context(repo_id)
        evidence = ctx.retriever.search(query, limit)
        return {"items": [e.to_dict() for e in evidence.items], "parsed": ctx.parsed}

    # ---- running an agent --------------------------------------------------------------
    def _history_messages(self, history: list[dict]) -> list[dict]:
        out = []
        for m in history[-HISTORY_MESSAGES:]:
            if m.get("error") or not m["content"]:
                continue
            out.append({"role": m["role"], "content": m["content"][:1500]})
        return out

    def _run_agent(self, ctx: AIContext, provider: LLMProvider, history: list[dict], agent_id: str, question: str) -> dict:
        started = time.perf_counter()
        base = {"provider": provider.name, "model": provider.model}
        try:
            if agent_id == "bug-investigator":
                result = self._chat_investigation(ctx, provider, question)
            elif agent_id == "documentation":
                result = self._chat_documentation(ctx, provider, question)
            else:
                result = self._chat_answer(ctx, provider, history, agent_id, question)
        except (ProviderError, ApiError) as exc:
            message = exc.message if isinstance(exc, ApiError) else str(exc)
            result = {"status": "failed", "answer": "", "error": message, "files": [], "evidence": [], "warnings": [], "steps": []}
        result.update(base)
        result["durationMs"] = int((time.perf_counter() - started) * 1000)
        return result

    def _chat_answer(self, ctx: AIContext, provider: LLMProvider, history: list[dict], agent_id: str, question: str) -> dict:
        gathered = gather(agent_id, ctx, question)
        evidence, warnings = gathered.evidence, list(gathered.warnings)
        steps = [{"agentId": agent_id, "label": f"Collected {len(evidence)} piece(s) of repository evidence"}]
        if gathered.needs_evidence and len(evidence) == 0:
            steps.append({"agentId": agent_id, "label": "No relevant code found; the model was not called"})
            return {"status": "no_evidence", "answer": NO_EVIDENCE_ANSWER, "files": [], "evidence": [], "warnings": warnings, "steps": steps}
        prompt = f"{format_evidence_block(evidence.items, ctx.settings.ai.context_chars)}\n\nQuestion: {question}"
        reply = provider.complete(PROMPTS[agent_id], self._history_messages(history) + [{"role": "user", "content": prompt}],
                                  ctx.settings.ai.max_tokens, ctx.settings.ai.temperature)
        files, grounding = ground_answer(reply.text, evidence.items, ctx.reader.paths())
        steps.append({"agentId": agent_id, "label": f"Answered with {provider.name}/{reply.model}"})
        return {"status": "completed", "answer": reply.text, "files": files, "evidence": [e.to_dict() for e in evidence.items],
                "warnings": warnings + grounding, "steps": steps}

    def _chat_investigation(self, ctx: AIContext, provider: LLMProvider, question: str) -> dict:
        payload = {"description": question, "stackTrace": question if parse_frames(question) else ""}
        result = investigate(ctx, payload, provider, config_message(self.settings.ai))
        self.store.save_investigation(ctx.repo_id, result)
        steps = [{"agentId": "bug-investigator", "label": t["message"]} for t in result["timeline"]]
        if result["status"] == "failed":
            raise ProviderError(result.get("failureReason") or "The AI analysis failed.")
        return {"status": result["status"], "answer": _investigation_markdown(result), "files": result["locations"],
                "evidence": result["evidence"], "warnings": result["caveats"], "steps": steps,
                "investigationId": result["id"]}

    def _chat_documentation(self, ctx: AIContext, provider: LLMProvider, question: str) -> dict:
        lowered = question.lower()
        doc_type, module = "project-overview", None
        if re.search(r"\bapi\b|endpoint|route", lowered):
            doc_type = "api"
        elif "architecture" in lowered:
            doc_type = "architecture"
        elif "depend" in lowered:
            doc_type = "dependency-report"
        else:
            with ctx.db.session() as conn:
                dirs = [r[0] for r in conn.execute("SELECT path FROM directories WHERE repository_id=? AND path!=''", (ctx.repo_id,))]
            named = [d for d in dirs if re.search(rf"(?<![\w/]){re.escape(d)}/?(?![\w/])", question)]
            if named and re.search(r"module|director|folder|package", lowered):
                doc_type, module = "module", max(named, key=len)
        document = self.generate_document(ctx.repo_id, doc_type, module, question, True, ctx=ctx, provider=provider)
        body = document["content"]
        if len(body) > 12000:
            body = body[:12000] + "\n\n_…truncated here; open the saved document for the full text._"
        answer = (f"Generated **{document['title']}** and saved it as a document (id `{document['id']}`); you can open or "
                  f"export it from the Documentation page.\n\n{body}")
        return {"status": "completed" if document["status"] == "ready" else "failed", "answer": answer, "files": [], "evidence": [],
                "warnings": document["warnings"], "documentId": document["id"],
                "steps": [{"agentId": "documentation", "label": f"Generated {document['title']} from the repository index"}]}

    def execute(self, ctx: AIContext, provider: LLMProvider, history: list[dict], question: str, forced: str | None,
                previous_agent: str | None) -> dict:
        mention = ctx.retriever.mentions_symbol(question) if ctx.parsed else False
        return self.supervisor.run(
            question, lambda agent_id, q: self._run_agent(ctx, provider, history, agent_id, q),
            forced=forced, previous_agent=previous_agent, symbol_mention=mention)

    # ---- chat --------------------------------------------------------------------------
    def chat(self, repo_id: str, message: str, conversation_id: str | None, forced: str | None) -> dict:
        message = (message or "").strip()
        if not message:
            raise ApiError(422, "empty_message", "Type a question first.")
        if len(message) > MAX_MESSAGE:
            raise ApiError(422, "message_too_long", f"Messages are limited to {MAX_MESSAGE} characters.")
        if forced and forced not in AGENTS:
            raise ApiError(422, "unknown_agent", f"Unknown agent '{forced}'.")
        ctx = self.context(repo_id)  # 404 / 409 before anything is stored
        provider = self.require_provider()  # 503 before anything is stored
        if conversation_id:
            conversation = self.store.conversation(conversation_id)
            if conversation["repositoryId"] != repo_id:
                raise ApiError(422, "conversation_mismatch", "That conversation belongs to a different repository.")
            cid = conversation_id
        else:
            cid = self.store.create_conversation(repo_id, message)
        history = self.store.messages(cid, HISTORY_MESSAGES)
        previous = next((m["agent"] for m in reversed(history) if m["role"] == "assistant" and m["agent"] and not m["error"]), None)
        user_message = self.store.add_message(cid, "user", message)
        started_at = utcnow()
        result = self.execute(ctx, provider, history, message, forced, previous)
        evidence_count = len(result.get("evidence", []))
        if result["status"] == "failed":
            error = result.get("error") or "The AI provider failed."
            failed = self.store.add_message(cid, "assistant", "", agent=result["agent"], error=error)
            self.store.add_run(repo_id, cid, result["agent"], message, result.get("routeReason"), "failed", provider.name,
                               provider.model, started_at, result["durationMs"], evidence_count, error)
            raise ApiError(502, "ai_provider_error", error, extra={"conversationId": cid, "messageId": failed["id"]})
        assistant = self.store.add_message(cid, "assistant", result["answer"], agent=result["agent"], files=result["files"],
                                           evidence=result["evidence"], warnings=result["warnings"])
        self.store.add_run(repo_id, cid, result["agent"], message, result.get("routeReason"), result["status"], provider.name,
                           provider.model, started_at, result["durationMs"], evidence_count, None)
        return {"conversationId": cid, "userMessage": user_message, "assistantMessage": assistant, "agent": result["agent"],
                "routeReason": result["routeReason"], "steps": result["steps"], "warnings": result["warnings"],
                "status": result["status"], "provider": provider.name, "model": provider.model, "durationMs": result["durationMs"]}

    def run_agent(self, repo_id: str, agent_id: str, question: str) -> dict:
        if agent_id not in AGENTS:
            raise ApiError(404, "unknown_agent", f"Unknown agent '{agent_id}'.")
        question = (question or "").strip()
        if not question:
            raise ApiError(422, "empty_message", "Type a question first.")
        if len(question) > MAX_MESSAGE:
            raise ApiError(422, "message_too_long", f"Questions are limited to {MAX_MESSAGE} characters.")
        ctx = self.context(repo_id)
        provider = self.require_provider()
        started_at = utcnow()
        result = self.execute(ctx, provider, [], question, agent_id, None)
        self.store.add_run(repo_id, None, agent_id, question, result.get("routeReason"), result["status"], provider.name,
                           provider.model, started_at, result["durationMs"], len(result.get("evidence", [])), result.get("error"))
        if result["status"] == "failed":
            raise ApiError(502, "ai_provider_error", result.get("error") or "The AI provider failed.")
        return {"agent": agent_id, "answer": result["answer"], "files": result["files"], "warnings": result["warnings"],
                "steps": result["steps"], "status": result["status"], "routeReason": result["routeReason"],
                "provider": provider.name, "model": provider.model, "durationMs": result["durationMs"]}

    # ---- investigations ----------------------------------------------------------------
    def investigate(self, repo_id: str, payload: dict) -> dict:
        for key, limit in (("description", 5000), ("errorMessage", 2000), ("stackTrace", 20000), ("title", 200),
                           ("filePath", 500), ("affectedModule", 200)):
            if len(payload.get(key) or "") > limit:
                raise ApiError(422, "input_too_long", f"{key} is limited to {limit} characters.")
        if not any((payload.get(k) or "").strip() for k in ("description", "errorMessage", "stackTrace")):
            raise ApiError(422, "empty_report", "Describe the bug or paste an error message or stack trace.")
        ctx = self.context(repo_id)
        provider = self.provider()
        started_at = utcnow()
        t0 = time.perf_counter()
        result = investigate(ctx, payload, provider, config_message(self.settings.ai))
        self.store.save_investigation(repo_id, result)
        question = (payload.get("title") or payload.get("errorMessage") or payload.get("description") or "").strip()
        status = {"completed": "completed", "evidence_only": "evidence_only", "no_evidence": "no_evidence"}.get(result["status"], "failed")
        self.store.add_run(repo_id, None, "bug-investigator", question, "Direct investigation request", status,
                           provider.name if provider else None, provider.model if provider else None, started_at,
                           int((time.perf_counter() - t0) * 1000), len(result["evidence"]), result.get("failureReason"))
        return result

    # ---- documentation -----------------------------------------------------------------
    def generate_document(self, repo_id: str, doc_type: str, module: str | None, instructions: str | None, use_ai: bool,
                          ctx: AIContext | None = None, provider: LLMProvider | None = None) -> dict:
        ctx = ctx or self.context(repo_id)
        started_at = utcnow()
        t0 = time.perf_counter()
        title, content, warnings = docs.build_document(ctx, doc_type, module)  # ApiError (bad type/module) propagates
        instructions = (instructions or "").strip()[:1000] or None
        provider = provider or (self.provider() if use_ai else None)
        ai_enhanced = False
        if use_ai and provider is None:
            warnings.append("No AI provider is configured, so this document contains repository facts only. " + config_message(self.settings.ai))
        elif use_ai and provider is not None:
            try:
                content = docs.add_ai_summary(provider, ctx, content, instructions)
                ai_enhanced = True
            except ProviderError as exc:
                warnings.append(f"The AI summary was skipped: {exc}")
        doc_id = self.store.save_document(repo_id, doc_type, module, instructions, title, content, ai_enhanced, warnings, "ready", None)
        self.store.add_run(repo_id, None, "documentation", f"Generate {title}", "Direct documentation request", "completed",
                           provider.name if ai_enhanced and provider else None, provider.model if ai_enhanced and provider else None,
                           started_at, int((time.perf_counter() - t0) * 1000), 0, None)
        return self.store.document(doc_id)


def _investigation_markdown(r: dict) -> str:
    lines = [f"**{r['title']}**", ""]
    if r["status"] == "no_evidence":
        return r["summary"]
    lines += [r["summary"], ""]
    if r.get("rootCause"):
        lines += [f"**Likely root cause** (confidence: {r['confidence']}): {r['rootCause']}", ""]
    if r.get("suggestedSolution"):
        lines += [f"**Suggested solution:** {r['suggestedSolution']}", ""]
    if r["locations"]:
        lines += ["**Relevant code**"] + [f"- `{loc['path']}:{loc['line']}`: {loc['reason']}" for loc in r["locations"][:8]] + [""]
    if r["caveats"]:
        lines += ["**Caveats**"] + [f"- {c}" for c in r["caveats"]] + [""]
    lines.append(f"_{r['note']}_")
    return "\n".join(lines)
