"""API models. JSON is camelCase to match the TypeScript types the frontend already defines."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PathCheckRequest(CamelModel):
    path: str = Field(max_length=1024)


class PathValidationResult(CamelModel):
    valid: bool
    message: str
    normalized_path: str | None = None
    is_git: bool = False


class RepositoryCreate(CamelModel):
    path: str = Field(max_length=1024)
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class RepositoryOut(CamelModel):
    id: str
    name: str
    path: str
    description: str | None = None
    languages: list[str]
    frameworks: list[str]
    last_analysed: str | None
    file_count: int
    folder_count: int
    main_language: str | None
    added_at: str
    status: Literal["indexed", "indexing", "not-indexed", "error"]
    origin: Literal["added"] = "added"
    is_git: bool
    branch: str | None = None
    commit: str | None = None
    last_error: str | None = None
    parsed: bool = False
    last_parsed_at: str | None = None


class ScanStart(CamelModel):
    extra_excludes: list[str] = Field(default_factory=list, max_length=50)


class ScanErrorOut(CamelModel):
    path: str | None
    message: str


class ScanProgressOut(CamelModel):
    scan_id: str
    repository_id: str
    status: Literal["queued", "running", "completed", "failed"]
    stage: str
    stage_index: int
    progress: int
    files_discovered: int
    folders_discovered: int
    files_changed: int
    files_unchanged: int
    languages_detected: list[str]
    frameworks_detected: list[str]
    seconds_remaining: int | None
    started_at: str
    finished_at: str | None
    error: str | None
    error_count: int
    errors: list[ScanErrorOut]


class LanguageShare(CamelModel):
    name: str
    percent: float
    files: int


class LanguageStat(LanguageShare):
    bytes: int
    lines: int


class GitSummary(CamelModel):
    is_git: bool
    branch: str | None
    commit: str | None


class ScanResultOut(CamelModel):
    scan_id: str
    repository_id: str
    completed_at: str
    duration_seconds: float
    files: int
    folders: int
    files_changed: int
    files_unchanged: int
    languages: list[LanguageShare]
    frameworks: list[str]
    technology_count: int
    package_managers: list[str]
    entry_points: list[str]
    file_categories: dict[str, int]
    sensitive_files_skipped: int
    skipped: dict[str, int]
    truncated: bool
    error_count: int
    git: GitSummary
    is_demo: Literal[False] = False


class TechnologyOut(CamelModel):
    name: str
    category: str
    version: str | None
    source: str
    confidence: str


class FileOut(CamelModel):
    path: str
    name: str
    extension: str
    language: str | None
    category: str
    size_bytes: int
    line_count: int | None
    sha256: str | None
    mtime_ns: int
    is_entry_point: bool
    is_sensitive: bool


class FilePage(CamelModel):
    total: int
    items: list[FileOut]


class TreeNode(CamelModel):
    path: str
    name: str
    type: Literal["file", "folder"]
    file_count: int | None = None
    children: list["TreeNode"] | None = None


TreeNode.model_rebuild()
Any  # noqa: B018
