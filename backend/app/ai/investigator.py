"""Bug investigation: deterministic evidence first (stack frames, symbols, literal message search, callers), then at
most one model call to interpret it. The model can only lower confidence, can only cite real evidence, and no code
is ever modified."""
from __future__ import annotations

import json
import re

from ..repo_service import utcnow
from .context import AIContext
from .evidence import GROUNDING_RULES, EvidenceSet, Evidence, format_evidence_block, ground_answer, tokenize
from .providers import LLMProvider, ProviderError
from .retrieval import enclosing_symbol
from .stacktrace import map_to_inventory, parse_frames
from .store import new_id

NOTE = ("No code was modified. Findings are leads based on static evidence from the repository index; verify them "
        "before changing anything.")
LEVELS = {"low": 0, "medium": 1, "high": 2}
SCORES = {"low": 30, "medium": 60, "high": 85}
SEVERITIES = {"critical", "high", "medium", "low", "informational"}
MAX_FRAMES = 6
FRAME_CONTEXT = 12
_EXCEPTION_LINE = re.compile(r"^\s*(?:[\w.$]+\.)?\w*(?:Error|Exception|Panic|Fault|Failure)\b\s*[:\-]?\s*(.*)$", re.I)
_LINE_PREFIX = re.compile(r"^\s*\d+ \| ?", re.M)

SYSTEM_PROMPT = (
    "You are a careful bug investigator. You get a bug report and numbered repository evidence. Respond with ONE JSON "
    "object and nothing else, with these keys: summary (string), likelyRootCause (string), suggestedSolution (string, "
    "described in words; do not claim anything is fixed), confidence (\"low\"|\"medium\"|\"high\"), supportingEvidence "
    "(array of evidence ids such as \"E1\"), findings (array of {title, description, severity: critical|high|medium|"
    "low|informational, evidenceId, impact, recommendation}), caveats (array of strings). "
    "If the evidence does not explain the problem, say so in summary and caveats and use confidence \"low\". "
    + GROUNDING_RULES
)


def _plain_code(snippet: str) -> str:
    return _LINE_PREFIX.sub("", snippet)


def _extract_json(text: str) -> dict | None:
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return None


def _message_candidates(error_message: str, stack_trace: str) -> tuple[list[str], list[str]]:
    """(literal strings that should appear in code verbatim, quoted fragments)."""
    source = (error_message or "").strip()
    if not source and stack_trace:
        for line in reversed([l for l in stack_trace.strip().splitlines() if l.strip()]):
            m = _EXCEPTION_LINE.match(line)
            if m:
                source = m.group(1).strip() or line.strip()
                break
    if not source:
        return [], []
    m = _EXCEPTION_LINE.match(source)
    if m and m.group(1).strip():
        source = m.group(1).strip()
    exact = []
    if 8 <= len(source) <= 150:
        exact.append(source)
    prefix = re.split(r"""['"`{}%\d]""", source, maxsplit=1)[0].strip()
    if len(prefix) >= 10 and prefix not in exact:
        exact.append(prefix)
    quoted = [q for q in re.findall(r"""['"`]([^'"`]{4,60})['"`]""", source) if q not in exact]
    return exact, quoted[:3]


def investigate(ctx: AIContext, payload: dict, provider: LLMProvider | None, unconfigured_message: str) -> dict:
    created = utcnow()
    timeline: list[dict] = []

    def log(stage: str, agent: str, message: str) -> None:
        timeline.append({"id": f"T{len(timeline) + 1}", "at": utcnow(), "stageId": stage, "agent": agent, "message": message})

    description = (payload.get("description") or "").strip()
    error_message = (payload.get("errorMessage") or "").strip()
    stack_trace = (payload.get("stackTrace") or "").strip()
    title = (payload.get("title") or "").strip() or (description or error_message or "Investigation")[:60]
    file_hint = (payload.get("filePath") or "").strip().replace("\\", "/").lstrip("./")
    module_hint = (payload.get("affectedModule") or "").strip()
    report = "\n".join(filter(None, [error_message, stack_trace, description]))
    log("input", "Bug Investigator", "Read the bug report" + (" with a stack trace" if stack_trace else ""))

    evidence = EvidenceSet()
    caveats: list[str] = []
    inventory = ctx.reader.paths()
    languages = {}
    with ctx.db.session() as conn:
        languages = {r[0]: r[1] for r in conn.execute("SELECT path, language FROM files WHERE repository_id=?", (ctx.repo_id,))}

    # 1. stack frames mapped to real files
    frames = parse_frames("\n".join(filter(None, [stack_trace, error_message, description])))
    mapped = ambiguous = 0
    enclosing: list[tuple[str, str]] = []
    for frame in frames:
        if mapped >= MAX_FRAMES:
            break
        path, is_ambiguous = map_to_inventory(frame.path, inventory)
        ambiguous += is_ambiguous
        if path is None:
            continue
        snippet = ctx.reader.snippet(path, frame.line - FRAME_CONTEXT, frame.line + FRAME_CONTEXT)
        if snippet is None:
            continue
        text, first, last = snippet
        enc = enclosing_symbol(ctx.db, ctx.repo_id, path, frame.line)
        added = evidence.add(path, first, last, "stack_frame",
                             f"stack frame {frame.function or 'frame'} at {path}:{frame.line}", text,
                             symbol=enc[0] if enc else None, focus_line=frame.line)
        if added is not None:
            mapped += 1
            if enc:
                enclosing.append((path, enc[0]))
    if frames:
        log("frames", "Code Intelligence", f"Parsed {len(frames)} stack frame(s); {mapped} map to files in this repository")
    if ambiguous:
        caveats.append(f"{ambiguous} stack frame path(s) matched several repository files and were skipped.")
    if frames and not mapped:
        caveats.append("None of the stack frames point to files in the scanned repository (they may be library or runtime code).")

    # 2. the file the user named
    hint_used = False
    if file_hint:
        path = file_hint if file_hint in inventory else next((p for p in inventory if p.endswith("/" + file_hint)), None)
        if path:
            ctx.retriever.add_file_head(evidence, path, 60, f"file named in the report: {path}")
            hint_used = True
        else:
            caveats.append(f"The file '{file_hint}' given in the report is not in the scanned repository.")

    # 3. symbols named in the report
    tokens, identifiers = tokenize(report)
    symbol_hits = [h for h in ctx.retriever.symbol_hits([], identifiers, 6) if h.score >= 8][:4]
    for hit in symbol_hits:
        ctx.retriever.add_symbol_evidence(evidence, hit, f"symbol named in the report: {hit.qualified_name}")
    if symbol_hits:
        log("symbols", "Code Intelligence", f"Found {len(symbol_hits)} symbol(s) named in the report")

    # 4. literal error message in the code
    exact, quoted = _message_candidates(error_message, stack_trace)
    exact_found = quoted_found = False
    if exact or quoted:
        for term_list, is_exact in ((exact, True), (quoted, False)):
            for path, line, _text, term in ctx.reader.grep(term_list, max_hits=6, ignore_case=False):
                snippet = ctx.reader.snippet(path, line - 4, line + 4)
                if snippet:
                    block, first, last = snippet
                    if evidence.add(path, first, last, "grep", f"line {line} contains the text '{term[:60]}'", block, focus_line=line):
                        exact_found |= is_exact
                        quoted_found |= not is_exact
        log("search", "Repository Explorer", "Searched the code for the error text: "
            + ("found it" if exact_found else "found only fragments" if quoted_found else "no match"))

    # 5. callers of the failing functions
    for path, symbol in enclosing[:2]:
        name = symbol.split(".")[-1]
        with ctx.db.session() as conn:
            callers = conn.execute(
                "SELECT path, source, line FROM relations WHERE repository_id=? AND relation='calls' AND target=?"
                " ORDER BY path, line LIMIT 4", (ctx.repo_id, name),
            ).fetchall()
        for c in callers:
            snippet = ctx.reader.snippet(c["path"], c["line"] - 3, c["line"] + 3)
            if snippet:
                block, first, last = snippet
                evidence.add(c["path"], first, last, "code", f"{c['source'] or 'module level'} calls {name}", block, focus_line=c["line"])
    if not ctx.parsed:
        caveats.append("The repository has not been parsed, so symbol and caller lookups were skipped.")

    # confidence ceiling from the strength of the evidence (the model can only go lower)
    if mapped or exact_found:
        ceiling = "high"
    elif symbol_hits or quoted_found or hint_used:
        ceiling = "medium"
    else:
        ceiling = "low"
    log("evidence", "Bug Investigator", f"Collected {len(evidence)} piece(s) of evidence (confidence ceiling: {ceiling})")

    result = {
        "id": new_id("inv"), "repositoryId": ctx.repo_id, "title": title, "description": description,
        "errorMessage": error_message or None, "filePath": file_hint or None, "affectedModule": module_hint or None,
        "createdAt": created, "summary": "", "rootCause": None, "suggestedSolution": None, "confidence": "low",
        "confidenceScore": 0, "findings": [], "recommendations": [], "locations": [], "caveats": caveats,
        "fixApplied": False, "note": NOTE, "aiUsed": False,
    }

    def finish(status: str, **extra) -> dict:
        result.update(status=status, completedAt=utcnow(), timeline=timeline, evidence=[e.to_dict() for e in evidence.items],
                      locations=_locations(evidence.items), **extra)
        return result

    if len(evidence) == 0:
        log("done", "Bug Investigator", "No relevant code found")
        return finish("no_evidence", summary="No code in the repository index matches this report (no stack frames, symbols or error text were found). Add the stack trace, the failing file or the exact error message and try again.",
                      message="No relevant code was found, so no analysis was attempted.")

    informational = _informational_findings(evidence.items, languages)
    if provider is None:
        log("done", "Bug Investigator", "AI provider not configured: returning located evidence only")
        return finish("evidence_only", summary=f"Located {len(evidence)} relevant code location(s). Root-cause analysis needs an AI provider.",
                      findings=informational, recommendations=["Review the located code against the error, then configure an AI provider for a root-cause analysis."],
                      message=unconfigured_message)

    # 6. one model call
    prompt = (f"Bug report title: {title}\nDescription: {description or '(none)'}\nError message: {error_message or '(none)'}\n"
              f"Affected module: {module_hint or '(none)'}\n\n{format_evidence_block(evidence.items, ctx.settings.ai.context_chars)}\n\nReturn the JSON object.")
    log("analysis", "Bug Investigator", f"Asked the model ({provider.name}/{provider.model}) to interpret the evidence")
    try:
        reply = provider.complete(SYSTEM_PROMPT, [{"role": "user", "content": prompt}], ctx.settings.ai.max_tokens, ctx.settings.ai.temperature)
    except ProviderError as exc:
        log("done", "Bug Investigator", "The AI provider failed")
        return finish("failed", summary="The evidence was collected but the AI analysis could not be completed.",
                      findings=informational, failureReason=str(exc))
    log("done", "Bug Investigator", "Validated the model's answer against the evidence")
    result["aiUsed"] = True
    by_id = evidence.by_id()
    data = _extract_json(reply.text)
    if data is None:
        result["caveats"].append("The model did not return structured JSON; its text is shown as the summary and confidence is low.")
        return finish("completed", summary=reply.text[:1500], findings=informational, confidence="low", confidenceScore=SCORES["low"],
                      recommendations=[])

    supporting = [i for i in (data.get("supportingEvidence") or []) if isinstance(i, str) and i in by_id]
    dropped = [i for i in (data.get("supportingEvidence") or []) if isinstance(i, str) and i not in by_id]
    claimed = data.get("confidence") if data.get("confidence") in LEVELS else "low"
    confidence = min(ceiling, claimed, key=LEVELS.__getitem__)
    if not supporting:
        confidence = "low"
        result["caveats"].append("The model did not cite any valid evidence for its conclusion, so confidence is low.")
    if dropped:
        result["caveats"].append("Ignored references to evidence that does not exist: " + ", ".join(dropped) + ".")
    findings = []
    for raw in data.get("findings") or []:
        if not isinstance(raw, dict) or raw.get("evidenceId") not in by_id:
            continue
        ev = by_id[raw["evidenceId"]]
        severity = raw.get("severity") if raw.get("severity") in SEVERITIES else "medium"
        findings.append({
            "id": f"F{len(findings) + 1}", "title": str(raw.get("title") or "Finding")[:160],
            "description": str(raw.get("description") or "")[:1200], "severity": severity,
            "confidence": max(10, SCORES[confidence] - (0 if ev.kind == "stack_frame" else 10)),
            "file": ev.path, "line": ev.focus_line or ev.start_line, "impact": str(raw.get("impact") or "")[:600],
            "recommendation": str(raw.get("recommendation") or "")[:600], "evidence": _code_evidence(ev, languages),
        })
    if len(findings) < len([f for f in (data.get("findings") or []) if isinstance(f, dict)]):
        result["caveats"].append("Some findings were dropped because they did not reference real evidence.")
    if not findings:
        findings = informational
    text_fields = " ".join(str(data.get(k) or "") for k in ("summary", "likelyRootCause", "suggestedSolution"))
    _, warnings = ground_answer(text_fields, evidence.items, ctx.reader.paths())
    result["caveats"] += [w for w in warnings if "mentions files" in w]
    result["caveats"] += [str(c)[:300] for c in (data.get("caveats") or []) if isinstance(c, str)][:5]
    recommendations = [r for r in dict.fromkeys(
        [str(data.get("suggestedSolution") or "").strip()] + [f["recommendation"] for f in findings if f["recommendation"]]) if r]
    return finish("completed", summary=str(data.get("summary") or "")[:1500] or "No summary was provided by the model.",
                  rootCause=str(data.get("likelyRootCause") or "") or None,
                  suggestedSolution=str(data.get("suggestedSolution") or "") or None, confidence=confidence,
                  confidenceScore=SCORES[confidence], findings=findings, recommendations=recommendations)


def _code_evidence(ev: Evidence, languages: dict) -> dict:
    return {"file": ev.path, "language": languages.get(ev.path) or "text", "startLine": ev.start_line,
            "code": _plain_code(ev.snippet), "highlightLines": [ev.focus_line] if ev.focus_line else []}


def _locations(items: list[Evidence]) -> list[dict]:
    out, seen = [], set()
    for ev in items:
        if ev.kind in ("stack_frame", "grep", "symbol", "code", "file") and ev.path:
            key = (ev.path, ev.focus_line or ev.start_line)
            if key not in seen:
                seen.add(key)
                out.append({"path": ev.path, "line": ev.focus_line or ev.start_line, "reason": ev.reason})
    return out


def _informational_findings(items: list[Evidence], languages: dict) -> list[dict]:
    findings = []
    for ev in items:
        if ev.kind not in ("stack_frame", "grep", "symbol", "code") or not ev.path:
            continue
        findings.append({
            "id": f"F{len(findings) + 1}", "title": ev.reason[:160],
            "description": f"Located in {ev.path} (lines {ev.start_line}-{ev.end_line}).", "severity": "informational",
            "confidence": 40 if ev.kind == "stack_frame" else 20, "file": ev.path, "line": ev.focus_line or ev.start_line,
            "impact": "Not established: this location was found by static search and is not confirmed as the cause.",
            "recommendation": "Read this code in the context of the reported error.", "evidence": _code_evidence(ev, languages),
        })
    return findings[:8]
