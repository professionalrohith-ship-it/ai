"""Repository retrieval. `Retriever` is the extension point: a vector store (e.g. ChromaDB) could implement it
later. The built-in LexicalRetriever needs nothing but the SQLite index and the repository files."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from ..db import Database
from .evidence import EvidenceSet, tokenize
from .reader import RepoReader

MAX_DEF_LINES = 60
MIN_SYMBOL_SCORE = 3.0
_PATH_TOKEN = re.compile(r"[\w.\-]+(?:[/\\][\w.\-]+)+|[\w\-]+\.(?:py|js|jsx|ts|tsx|java|c|h|cpp|cs|go|rs|php|rb|json|md|html|css|sql|toml|ya?ml)\b")


@dataclass
class SymbolHit:
    id: int
    name: str
    kind: str
    path: str
    qualified_name: str
    start_line: int
    end_line: int
    signature: str | None
    score: float


class Retriever(Protocol):
    def search(self, question: str, limit: int = 8) -> EvidenceSet: ...


class LexicalRetriever:
    def __init__(self, db: Database, repo_id: str, reader: RepoReader):
        self.db = db
        self.repo_id = repo_id
        self.reader = reader

    # ---- symbols -----------------------------------------------------------------------
    def symbol_hits(self, tokens: list[str], identifiers: list[str], limit: int = 8) -> list[SymbolHit]:
        wanted = list(dict.fromkeys([*(i.lower() for i in identifiers), *tokens]))[:10]
        if not wanted:
            return []
        clauses, args = [], [self.repo_id]
        for token in wanted:
            like = f"%{token.replace(chr(92), chr(92) * 2).replace('%', chr(92) + '%').replace('_', chr(92) + '_')}%"
            clauses.append(
                "(lower(name) LIKE ? ESCAPE '\\' OR lower(qualified_name) LIKE ? ESCAPE '\\' OR lower(path) LIKE ? ESCAPE '\\'"
                " OR lower(coalesce(signature,'')) LIKE ? ESCAPE '\\' OR lower(coalesce(docstring,'')) LIKE ? ESCAPE '\\')"
            )
            args += [like] * 5
        with self.db.session() as conn:
            rows = conn.execute(
                f"SELECT id, name, kind, path, qualified_name, start_line, end_line, signature, docstring FROM symbols"
                f" WHERE repository_id=? AND ({' OR '.join(clauses)}) LIMIT 600", args,
            ).fetchall()
        exact = {i.lower() for i in identifiers}
        hits: list[SymbolHit] = []
        for r in rows:
            name, qname, path = r["name"].lower(), r["qualified_name"].lower(), r["path"].lower()
            sig, doc = (r["signature"] or "").lower(), (r["docstring"] or "").lower()
            score = 0.0
            for token in wanted:
                if name == token or (token in exact and name == token):
                    score += 8
                elif token in name:
                    score += 3
                elif token in qname or token in path:
                    score += 1.5
                if token in sig or token in doc:
                    score += 1
            if r["kind"] in ("class", "function", "method", "interface", "struct", "trait", "enum", "constructor"):
                score += 0.5
            elif r["kind"] in ("variable", "property"):
                score -= 1
            if score >= MIN_SYMBOL_SCORE:
                hits.append(SymbolHit(r["id"], r["name"], r["kind"], r["path"], r["qualified_name"], r["start_line"],
                                      r["end_line"], r["signature"], score))
        hits.sort(key=lambda h: (-h.score, h.path, h.start_line))
        return hits[:limit]

    def mentions_symbol(self, question: str) -> bool:
        tokens, identifiers = tokenize(question)
        return any(h.score >= 8 for h in self.symbol_hits([], identifiers, 3)) if identifiers else False

    # ---- paths -------------------------------------------------------------------------
    def mentioned_paths(self, question: str) -> list[str]:
        """Inventory files the text names explicitly (full path, path suffix or unique basename)."""
        inventory = self.reader.paths()
        by_base: dict[str, list[str]] = {}
        for p in inventory:
            by_base.setdefault(p.rsplit("/", 1)[-1], []).append(p)
        found: list[str] = []
        for match in _PATH_TOKEN.findall(question or ""):
            token = match.replace("\\", "/").lstrip("./")
            candidates = [p for p in inventory if p == token or p.endswith("/" + token)]
            if not candidates and "/" not in token:
                candidates = by_base.get(token, [])
            if len(candidates) == 1 and candidates[0] not in found:
                found.append(candidates[0])
        return found

    def path_hits(self, tokens: list[str], limit: int = 3) -> list[str]:
        if len(tokens) < 1:
            return []
        scored = []
        for path in self.reader.paths():
            lowered = path.lower()
            matched = sum(1 for t in tokens if t in lowered)
            if matched >= 2 or (matched == 1 and len(tokens) == 1 and len(tokens[0]) >= 5):
                scored.append((-matched, len(path), path))
        scored.sort()
        return [p for _, _, p in scored[:limit]]

    # ---- evidence ----------------------------------------------------------------------
    def add_symbol_evidence(self, evidence: EvidenceSet, hit: SymbolHit, reason: str | None = None) -> None:
        end = min(hit.end_line, hit.start_line + MAX_DEF_LINES - 1)
        snippet = self.reader.snippet(hit.path, hit.start_line, end)
        if snippet is None:
            return
        text, first, last = snippet
        evidence.add(hit.path, first, last, "symbol", reason or f"definition of {hit.kind} {hit.qualified_name}", text,
                     symbol=hit.qualified_name)

    def add_file_head(self, evidence: EvidenceSet, path: str, lines: int = 40, reason: str | None = None) -> None:
        snippet = self.reader.snippet(path, 1, lines)
        if snippet is not None:
            text, first, last = snippet
            evidence.add(path, first, last, "file", reason or f"start of {path}", text)

    def search(self, question: str, limit: int = 8) -> EvidenceSet:
        evidence = EvidenceSet()
        tokens, identifiers = tokenize(question)
        for path in self.mentioned_paths(question)[:2]:
            self.add_file_head(evidence, path, 50, f"file named in the question: {path}")
        hits = self.symbol_hits(tokens, identifiers, limit)
        for hit in hits[: max(1, limit - len(evidence))]:
            self.add_symbol_evidence(evidence, hit)
        if len(evidence) < limit:
            for path in self.path_hits(tokens, 2):
                self.add_file_head(evidence, path, 30, f"file path matches the question: {path}")
        if len(evidence) < max(2, limit // 2):  # symbols did not cover it: look for the words in the code itself
            terms = [i for i in identifiers if len(i) >= 4] or [t for t in tokens if len(t) >= 5][:3]
            for path, line, text, term in self.reader.grep(terms, max_hits=12):
                if len(evidence) >= limit:
                    break
                snippet = self.reader.snippet(path, line - 3, line + 3)
                if snippet:
                    block, first, last = snippet
                    evidence.add(path, first, last, "grep", f"line {line} contains '{term}'", block, focus_line=line)
        return evidence


def enclosing_symbol(db: Database, repo_id: str, path: str, line: int) -> tuple[str, int, int] | None:
    """Smallest symbol whose range contains the line: (qualified name, start, end)."""
    with db.session() as conn:
        row = conn.execute(
            "SELECT qualified_name, start_line, end_line FROM symbols WHERE repository_id=? AND path=?"
            " AND start_line<=? AND end_line>=? AND kind IN ('function','method','constructor','class','interface','struct','trait','enum')"
            " ORDER BY (end_line-start_line) ASC LIMIT 1", (repo_id, path, line, line),
        ).fetchone()
    return (row["qualified_name"], row["start_line"], row["end_line"]) if row else None
