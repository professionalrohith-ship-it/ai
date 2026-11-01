"""SQLite persistence for chat, agent runs, investigations and documents."""
from __future__ import annotations

import json
import uuid

from ..db import Database
from ..errors import ApiError
from ..repo_service import utcnow


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _message(row) -> dict:
    return {
        "id": row["id"], "role": row["role"], "content": row["content"], "createdAt": row["created_at"],
        "agent": row["agent"], "files": json.loads(row["files_json"]), "warnings": json.loads(row["warnings_json"]),
        "error": row["error"],
    }


def _document(row) -> dict:
    return {
        "id": row["id"], "title": row["title"], "type": row["type"], "repositoryId": row["repository_id"],
        "repositoryName": row["repository_name"] if "repository_name" in row.keys() else "", "module": row["module"],
        "instructions": row["instructions"], "format": "markdown", "content": row["content_md"], "status": row["status"],
        "aiEnhanced": bool(row["ai_enhanced"]), "warnings": json.loads(row["warnings_json"]),
        "createdAt": row["created_at"], "updatedAt": row["updated_at"], "failureReason": row["failure_reason"],
    }


class AIStore:
    def __init__(self, db: Database):
        self.db = db

    # ---- conversations -----------------------------------------------------------------
    def create_conversation(self, repo_id: str, title: str) -> str:
        cid, now = new_id("conv"), utcnow()
        with self.db.tx() as conn:
            conn.execute("INSERT INTO conversations (id, repository_id, title, created_at, updated_at) VALUES (?,?,?,?,?)",
                         (cid, repo_id, title[:60] or "New conversation", now, now))
        return cid

    def conversation(self, cid: str) -> dict:
        with self.db.session() as conn:
            row = conn.execute(
                "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS n FROM conversations c WHERE c.id=?",
                (cid,),
            ).fetchone()
        if row is None:
            raise ApiError(404, "conversation_not_found", "Conversation not found.")
        return self._conversation(row)

    @staticmethod
    def _conversation(row) -> dict:
        return {"id": row["id"], "title": row["title"], "repositoryId": row["repository_id"],
                "createdAt": row["created_at"], "updatedAt": row["updated_at"], "messageCount": row["n"]}

    def conversations(self, repo_id: str) -> list[dict]:
        with self.db.session() as conn:
            rows = conn.execute(
                "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS n FROM conversations c"
                " WHERE c.repository_id=? ORDER BY c.updated_at DESC, c.rowid DESC", (repo_id,)
            ).fetchall()
        return [self._conversation(r) for r in rows]

    def conversation_with_messages(self, cid: str) -> dict:
        data = self.conversation(cid)
        data["messages"] = self.messages(cid)
        return data

    def messages(self, cid: str, limit: int | None = None) -> list[dict]:
        with self.db.session() as conn:
            rows = conn.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY rowid", (cid,)).fetchall()
        items = [_message(r) for r in rows]
        return items[-limit:] if limit else items

    def add_message(self, cid: str, role: str, content: str, agent: str | None = None, files: list | None = None,
                    evidence: list | None = None, warnings: list | None = None, error: str | None = None) -> dict:
        mid, now = new_id("msg"), utcnow()
        with self.db.tx() as conn:
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, agent, files_json, evidence_json, warnings_json,"
                " error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (mid, cid, role, content, agent, json.dumps(files or []), json.dumps(evidence or []),
                 json.dumps(warnings or []), error, now),
            )
            conn.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, cid))
        return {"id": mid, "role": role, "content": content, "createdAt": now, "agent": agent, "files": files or [],
                "warnings": warnings or [], "error": error}

    def rename_conversation(self, cid: str, title: str) -> dict:
        with self.db.tx() as conn:
            changed = conn.execute("UPDATE conversations SET title=? WHERE id=?", (title.strip()[:120], cid)).rowcount
        if not changed:
            raise ApiError(404, "conversation_not_found", "Conversation not found.")
        return self.conversation(cid)

    def delete_conversation(self, cid: str) -> None:
        with self.db.tx() as conn:
            conn.execute("UPDATE agent_runs SET conversation_id=NULL WHERE conversation_id=?", (cid,))
            if not conn.execute("DELETE FROM conversations WHERE id=?", (cid,)).rowcount:
                raise ApiError(404, "conversation_not_found", "Conversation not found.")

    # ---- agent runs --------------------------------------------------------------------
    def add_run(self, repo_id: str, conversation_id: str | None, agent: str, question: str, route_reason: str | None,
                status: str, provider: str | None, model: str | None, started_at: str, duration_ms: int,
                evidence_count: int, error: str | None) -> str:
        rid = new_id("run")
        with self.db.tx() as conn:
            conn.execute(
                "INSERT INTO agent_runs (id, repository_id, conversation_id, agent, question, route_reason, status, provider,"
                " model, started_at, duration_ms, evidence_count, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (rid, repo_id, conversation_id, agent, question[:500], route_reason, status, provider, model, started_at,
                 duration_ms, evidence_count, error),
            )
        return rid

    def runs(self, repo_id: str | None, limit: int) -> list[dict]:
        sql = ("SELECT r.*, p.name AS repository_name FROM agent_runs r JOIN repositories p ON p.id=r.repository_id"
               + (" WHERE r.repository_id=?" if repo_id else "") + " ORDER BY r.started_at DESC, r.rowid DESC LIMIT ?")
        with self.db.session() as conn:
            rows = conn.execute(sql, ((repo_id, limit) if repo_id else (limit,))).fetchall()
        return [{
            "id": r["id"], "repositoryId": r["repository_id"], "repositoryName": r["repository_name"], "agent": r["agent"],
            "question": r["question"], "status": r["status"], "routeReason": r["route_reason"], "provider": r["provider"],
            "model": r["model"], "startedAt": r["started_at"], "durationMs": r["duration_ms"],
            "evidenceCount": r["evidence_count"], "error": r["error"], "conversationId": r["conversation_id"],
        } for r in rows]

    # ---- investigations ----------------------------------------------------------------
    def save_investigation(self, repo_id: str, result: dict) -> None:
        with self.db.tx() as conn:
            conn.execute(
                "INSERT INTO investigations (id, repository_id, title, status, confidence, created_at, completed_at, result_json)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (result["id"], repo_id, result["title"], result["status"], result.get("confidence"), result["createdAt"],
                 result.get("completedAt"), json.dumps(result)),
            )

    def investigation(self, iid: str) -> dict:
        with self.db.session() as conn:
            row = conn.execute("SELECT result_json FROM investigations WHERE id=?", (iid,)).fetchone()
        if row is None:
            raise ApiError(404, "investigation_not_found", "Investigation not found.")
        return json.loads(row["result_json"])

    def investigations(self, repo_id: str) -> list[dict]:
        with self.db.session() as conn:
            rows = conn.execute(
                "SELECT result_json FROM investigations WHERE repository_id=? ORDER BY created_at DESC, rowid DESC", (repo_id,)
            ).fetchall()
        return [json.loads(r["result_json"]) for r in rows]

    def delete_investigation(self, iid: str) -> None:
        with self.db.tx() as conn:
            if not conn.execute("DELETE FROM investigations WHERE id=?", (iid,)).rowcount:
                raise ApiError(404, "investigation_not_found", "Investigation not found.")

    # ---- documents ---------------------------------------------------------------------
    def save_document(self, repo_id: str, doc_type: str, module: str | None, instructions: str | None, title: str,
                      content: str, ai_enhanced: bool, warnings: list[str], status: str, failure: str | None) -> str:
        did, now = new_id("doc"), utcnow()
        with self.db.tx() as conn:
            conn.execute(
                "INSERT INTO documents (id, repository_id, type, module, instructions, title, content_md, ai_enhanced,"
                " warnings_json, status, failure_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (did, repo_id, doc_type, module, instructions, title, content, int(ai_enhanced), json.dumps(warnings),
                 status, failure, now, now),
            )
        return did

    _DOC_SQL = "SELECT d.*, r.name AS repository_name FROM documents d JOIN repositories r ON r.id=d.repository_id"

    def document(self, did: str) -> dict:
        with self.db.session() as conn:
            row = conn.execute(f"{self._DOC_SQL} WHERE d.id=?", (did,)).fetchone()
        if row is None:
            raise ApiError(404, "document_not_found", "Document not found.")
        return _document(row)

    def documents(self, repo_id: str) -> list[dict]:
        with self.db.session() as conn:
            rows = conn.execute(f"{self._DOC_SQL} WHERE d.repository_id=? ORDER BY d.created_at DESC, d.rowid DESC", (repo_id,)).fetchall()
        return [_document(r) for r in rows]

    def delete_document(self, did: str) -> None:
        with self.db.tx() as conn:
            if not conn.execute("DELETE FROM documents WHERE id=?", (did,)).rowcount:
                raise ApiError(404, "document_not_found", "Document not found.")
