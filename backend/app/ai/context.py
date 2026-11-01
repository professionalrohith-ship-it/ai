from __future__ import annotations

from dataclasses import dataclass

from ..config import Settings
from ..db import Database
from ..intelligence.queries import IntelligenceQueries
from ..queries import Queries
from ..repo_service import RepositoryRow, RepositoryService
from ..views import is_parsed
from .reader import RepoReader
from .retrieval import LexicalRetriever


@dataclass
class AIContext:
    """Everything an agent may read for one repository: the SQLite index and the (safely read) files."""

    db: Database
    repo: RepositoryRow
    reader: RepoReader
    retriever: LexicalRetriever
    queries: Queries
    intel: IntelligenceQueries
    repos: RepositoryService
    settings: Settings
    parsed: bool

    @property
    def repo_id(self) -> str:
        return self.repo.id


def build_context(db: Database, repo: RepositoryRow, queries: Queries, intel: IntelligenceQueries,
                  repos: RepositoryService, settings: Settings) -> AIContext:
    reader = RepoReader(db, repo.id, repo.path, settings.max_file_bytes)
    return AIContext(db, repo, reader, LexicalRetriever(db, repo.id, reader), queries, intel, repos, settings,
                     is_parsed(db, repo.id))
