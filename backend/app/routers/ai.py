from __future__ import annotations

import json
import re

from fastapi import APIRouter, Query, Request, Response

from ..ai.agents import AGENTS
from ..ai.docs import DOC_TYPES
from ..schemas import CamelModel

router = APIRouter(prefix="/api", tags=["ai"])


class ChatRequest(CamelModel):
    message: str
    conversation_id: str | None = None
    agent: str | None = None


class RenameRequest(CamelModel):
    title: str


class ContextSearchRequest(CamelModel):
    query: str
    limit: int = 8


class AgentRunRequest(CamelModel):
    question: str


class InvestigationRequest(CamelModel):
    title: str | None = None
    description: str | None = None
    error_message: str | None = None
    stack_trace: str | None = None
    file_path: str | None = None
    affected_module: str | None = None


class DocumentRequest(CamelModel):
    type: str
    module: str | None = None
    instructions: str | None = None
    use_ai: bool = True


def _ai(request: Request):
    return request.app.state.ai


# ---- status and agents -----------------------------------------------------------------------
@router.get("/ai/status")
def ai_status(request: Request, check: bool = False):
    return _ai(request).status(check)


@router.get("/ai/agents")
def ai_agents():
    return [{"id": a.id, "name": a.name, "role": a.role, "description": a.description, "usesAi": a.uses_ai}
            for a in AGENTS.values()]


# ---- chat ------------------------------------------------------------------------------------
@router.post("/repositories/{repo_id}/chat")
def chat(repo_id: str, body: ChatRequest, request: Request):
    return _ai(request).chat(repo_id, body.message, body.conversation_id, body.agent)


@router.get("/repositories/{repo_id}/conversations")
def conversations(repo_id: str, request: Request):
    request.app.state.repos.get(repo_id)
    return _ai(request).store.conversations(repo_id)


@router.get("/conversations/{conversation_id}")
def conversation(conversation_id: str, request: Request):
    return _ai(request).store.conversation_with_messages(conversation_id)


@router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, body: RenameRequest, request: Request):
    return _ai(request).store.rename_conversation(conversation_id, body.title)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, request: Request):
    _ai(request).store.delete_conversation(conversation_id)
    return Response(status_code=204)


@router.post("/repositories/{repo_id}/context/search")
def context_search(repo_id: str, body: ContextSearchRequest, request: Request):
    return _ai(request).retrieve(repo_id, body.query, max(1, min(body.limit, 30)))


# ---- agents ----------------------------------------------------------------------------------
@router.get("/agent-runs")
def all_agent_runs(request: Request, limit: int = Query(100, ge=1, le=500)):
    return _ai(request).store.runs(None, limit)


@router.get("/repositories/{repo_id}/agent-runs")
def agent_runs(repo_id: str, request: Request, limit: int = Query(100, ge=1, le=500)):
    request.app.state.repos.get(repo_id)
    return _ai(request).store.runs(repo_id, limit)


@router.post("/repositories/{repo_id}/agents/{agent_id}/run")
def run_agent(repo_id: str, agent_id: str, body: AgentRunRequest, request: Request):
    return _ai(request).run_agent(repo_id, agent_id, body.question)


# ---- investigations --------------------------------------------------------------------------
@router.post("/repositories/{repo_id}/investigations")
def start_investigation(repo_id: str, body: InvestigationRequest, request: Request):
    return _ai(request).investigate(repo_id, {
        "title": body.title, "description": body.description, "errorMessage": body.error_message,
        "stackTrace": body.stack_trace, "filePath": body.file_path, "affectedModule": body.affected_module,
    })


@router.get("/repositories/{repo_id}/investigations")
def list_investigations(repo_id: str, request: Request):
    request.app.state.repos.get(repo_id)
    return _ai(request).store.investigations(repo_id)


@router.get("/investigations/{investigation_id}")
def get_investigation(investigation_id: str, request: Request):
    return _ai(request).store.investigation(investigation_id)


@router.delete("/investigations/{investigation_id}", status_code=204)
def delete_investigation(investigation_id: str, request: Request):
    _ai(request).store.delete_investigation(investigation_id)
    return Response(status_code=204)


# ---- documentation ---------------------------------------------------------------------------
@router.get("/documentation/types")
def documentation_types():
    return DOC_TYPES


@router.post("/repositories/{repo_id}/documentation")
def generate_documentation(repo_id: str, body: DocumentRequest, request: Request):
    return _ai(request).generate_document(repo_id, body.type, body.module, body.instructions, body.use_ai)


@router.get("/repositories/{repo_id}/documentation")
def list_documentation(repo_id: str, request: Request):
    request.app.state.repos.get(repo_id)
    return _ai(request).store.documents(repo_id)


@router.get("/documentation/{document_id}")
def get_document(document_id: str, request: Request):
    return _ai(request).store.document(document_id)


@router.delete("/documentation/{document_id}", status_code=204)
def delete_document(document_id: str, request: Request):
    _ai(request).store.delete_document(document_id)
    return Response(status_code=204)


@router.get("/documentation/{document_id}/export")
def export_document(document_id: str, request: Request, format: str = Query("md", pattern="^(md|json)$")):
    doc = _ai(request).store.document(document_id)
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", doc["title"]).strip("-")[:80] or "document"
    if format == "json":
        body, media, extension = json.dumps(doc, indent=2), "application/json", "json"
    else:
        body, media, extension = doc["content"], "text/markdown; charset=utf-8", "md"
    return Response(content=body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{name}.{extension}"'})
