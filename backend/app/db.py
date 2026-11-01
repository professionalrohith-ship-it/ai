"""SQLite access. One short-lived connection per operation; WAL lets API reads proceed during a scan."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA_VERSION = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  path_key TEXT NOT NULL UNIQUE,
  description TEXT,
  is_git INTEGER NOT NULL DEFAULT 0,
  branch TEXT,
  commit_hash TEXT,
  status TEXT NOT NULL DEFAULT 'not-indexed',
  added_at TEXT NOT NULL,
  last_scanned_at TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  folder_count INTEGER NOT NULL DEFAULT 0,
  main_language TEXT,
  languages_json TEXT NOT NULL DEFAULT '[]',
  frameworks_json TEXT NOT NULL DEFAULT '[]',
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'initialise',
  progress INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  files_discovered INTEGER NOT NULL DEFAULT 0,
  folders_discovered INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  files_unchanged INTEGER NOT NULL DEFAULT 0,
  languages_json TEXT NOT NULL DEFAULT '[]',
  frameworks_json TEXT NOT NULL DEFAULT '[]',
  summary_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_scans_repo ON scans(repository_id, started_at DESC);

CREATE TABLE IF NOT EXISTS scan_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  path TEXT,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_errors_scan ON scan_errors(scan_id);

CREATE TABLE IF NOT EXISTS files (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  directory TEXT NOT NULL,
  extension TEXT NOT NULL,
  language TEXT,
  category TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  line_count INTEGER,
  sha256 TEXT,
  mtime_ns INTEGER NOT NULL,
  is_entry_point INTEGER NOT NULL DEFAULT 0,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  last_scan_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, path)
);
CREATE INDEX IF NOT EXISTS idx_files_category ON files(repository_id, category);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(repository_id, language);

CREATE TABLE IF NOT EXISTS directories (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repository_id, path)
);

CREATE TABLE IF NOT EXISTS technologies (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,
  PRIMARY KEY (repository_id, name, category)
);

-- Stage 3: code intelligence
CREATE TABLE IF NOT EXISTS parse_runs (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'initialise',
  progress INTEGER NOT NULL DEFAULT 0,
  force INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  parsed_files INTEGER NOT NULL DEFAULT 0,
  unchanged_files INTEGER NOT NULL DEFAULT 0,
  partial_files INTEGER NOT NULL DEFAULT 0,
  unsupported_files INTEGER NOT NULL DEFAULT 0,
  skipped_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  deleted_files INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_parse_runs_repo ON parse_runs(repository_id, started_at DESC);

CREATE TABLE IF NOT EXISTS code_files (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  sha256 TEXT,
  language TEXT,
  status TEXT NOT NULL,
  syntax_errors INTEGER NOT NULL DEFAULT 0,
  first_error_line INTEGER,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  import_count INTEGER NOT NULL DEFAULT 0,
  namespace TEXT,
  module_docstring TEXT,
  message TEXT,
  parser_version TEXT NOT NULL,
  parsed_at TEXT NOT NULL,
  last_run_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, path)
);
CREATE INDEX IF NOT EXISTS idx_code_files_status ON code_files(repository_id, status);

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  parent TEXT,
  language TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT,
  parameters_json TEXT NOT NULL DEFAULT '[]',
  return_type TEXT,
  decorators_json TEXT NOT NULL DEFAULT '[]',
  bases_json TEXT NOT NULL DEFAULT '[]',
  interfaces_json TEXT NOT NULL DEFAULT '[]',
  docstring TEXT,
  exported INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(repository_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(repository_id, kind);
CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(repository_id, path);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  module TEXT NOT NULL,
  kind TEXT NOT NULL,
  names_json TEXT NOT NULL DEFAULT '[]',
  alias TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  dep_type TEXT NOT NULL DEFAULT 'unresolved',
  resolved_path TEXT,
  package TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_imports_path ON imports(repository_id, path);
CREATE INDEX IF NOT EXISTS idx_imports_type ON imports(repository_id, dep_type);

CREATE TABLE IF NOT EXISTS relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  relation TEXT NOT NULL,
  target TEXT NOT NULL,
  line INTEGER NOT NULL,
  target_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_relations_path ON relations(repository_id, path);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(repository_id, relation, target);

-- Stage 4: AI features
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_repo ON conversations(repository_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent TEXT,
  files_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  conversation_id TEXT,
  agent TEXT NOT NULL,
  question TEXT NOT NULL,
  route_reason TEXT,
  status TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  started_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_repo ON agent_runs(repository_id, started_at DESC);

CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investigations_repo ON investigations(repository_id, created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  module TEXT,
  instructions TEXT,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  ai_enhanced INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repository_id, created_at DESC);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        # isolation_level=None: transactions are explicit (see tx()).
        conn = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        return conn

    @contextmanager
    def session(self) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self.session() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            else:
                conn.execute("COMMIT")

    def init(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.session() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")