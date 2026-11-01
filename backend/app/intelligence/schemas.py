from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from ..schemas import CamelModel


class ParseStart(CamelModel):
    force: bool = False  # re-parse every file even when unchanged


class ProblemFile(CamelModel):
    path: str
    status: str
    message: str | None


class ParseRunOut(CamelModel):
    run_id: str
    repository_id: str
    status: Literal["queued", "running", "completed", "failed"]
    stage: str
    progress: int
    forced: bool
    started_at: str
    finished_at: str | None
    total_files: int
    processed_files: int
    parsed_files: int
    unchanged_files: int
    partial_files: int
    unsupported_files: int
    skipped_files: int
    failed_files: int
    deleted_files: int
    seconds_remaining: int | None
    error: str | None
    problems: list[ProblemFile]


class ParsedFileOut(CamelModel):
    path: str
    language: str | None
    status: str
    syntax_errors: int
    first_error_line: int | None
    symbol_count: int
    import_count: int
    message: str | None
    parsed_at: str
    sha256: str | None


class ParsedFilePage(CamelModel):
    total: int
    by_status: dict[str, int]
    items: list[ParsedFileOut]


class Relationship(CamelModel):
    relation: str
    target: str
    target_path: str | None = None


class SymbolOut(CamelModel):
    id: int
    name: str
    kind: str
    qualified_name: str
    parent: str | None
    path: str
    language: str
    start_line: int
    end_line: int
    signature: str | None
    parameters: list[dict[str, Any]]
    return_type: str | None
    decorators: list[str]
    bases: list[str]
    interfaces: list[str]
    docstring: str | None
    exported: bool
    relationships: list[Relationship] = Field(default_factory=list)


class SymbolPage(CamelModel):
    total: int
    items: list[SymbolOut]


class SymbolNode(CamelModel):
    id: int
    name: str
    kind: str
    qualified_name: str
    parent: str | None
    language: str
    start_line: int
    end_line: int
    signature: str | None
    parameters: list[dict[str, Any]]
    return_type: str | None
    decorators: list[str]
    bases: list[str]
    interfaces: list[str]
    docstring: str | None
    exported: bool
    children: list["SymbolNode"]


SymbolNode.model_rebuild()


class ImportOut(CamelModel):
    line: int
    module: str
    kind: str
    names: list[str]
    alias: str | None
    dep_type: Literal["internal", "external", "stdlib", "unresolved"]
    resolved_path: str | None
    package: str | None
    note: str | None


class FileRelation(CamelModel):
    source: str
    relation: str
    target: str
    line: int
    target_path: str | None


class FileCall(CamelModel):
    source: str
    target: str
    line: int


class FileStructure(CamelModel):
    path: str
    language: str | None
    status: str
    syntax_errors: int
    first_error_line: int | None
    message: str | None
    namespace: str | None
    module_docstring: str | None
    parsed_at: str
    symbol_count: int
    symbols: list[SymbolNode]
    imports: list[ImportOut]
    relations: list[FileRelation]
    calls: list[FileCall]


class ImportRow(ImportOut):
    path: str


class ImportPage(CamelModel):
    total: int
    items: list[ImportRow]


class ExternalPackage(CamelModel):
    package: str
    files: int
    imports: int


class ModuleCount(CamelModel):
    module: str
    files: int


class UnresolvedModule(ModuleCount):
    note: str | None


class DependencySummary(CamelModel):
    files_with_imports: int
    counts: dict[str, int]
    internal_file_edges: int
    internal_without_file: int
    external_packages: list[ExternalPackage]
    stdlib_modules: list[ModuleCount]
    unresolved: list[UnresolvedModule]
    resolution: str


class GraphNode(CamelModel):
    id: str
    type: str
    language: str | None = None
    label: str | None = None


class GraphEdge(CamelModel):
    source: str
    target: str
    relation: str
    dep_type: str
    count: int
    names: list[str]


class DependencyGraph(CamelModel):
    directed: bool
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    truncated: bool
    resolution: str


# ---- symbol detail, references, code, graph analysis -------------------------------------------
class CodeLine(CamelModel):
    number: int
    text: str


class CodeSection(CamelModel):
    path: str
    start_line: int
    end_line: int
    total_lines: int
    lines: list[CodeLine]
    stale: bool  # file changed since the last scan: indexed line numbers may be off


class SymbolDetail(CamelModel):
    symbol: SymbolOut
    code: CodeSection | None = None
    code_truncated: bool = False


class ImportedBy(CamelModel):
    path: str
    line: int
    module: str
    kind: str
    names: list[str]
    evidence: Literal["imports-symbol", "imports-module"]


class Reference(CamelModel):
    path: str
    line: int
    kind: str
    source: str
    confidence: Literal["high", "name-match-only"]


class SymbolReferences(CamelModel):
    symbol: SymbolOut
    imported_by: list[ImportedBy]
    imported_by_total: int
    references: list[Reference]
    references_total: int
    note: str


class ImportantModule(CamelModel):
    path: str
    language: str | None
    fan_in: int
    fan_out: int
    transitive_dependents: int | None = None


class PackageUse(CamelModel):
    package: str
    files: int


class CycleGroup(CamelModel):
    size: int
    files: list[str]
    truncated: bool
    example_cycle: list[str]


class GraphStats(CamelModel):
    files: int
    internal_edges: int
    external_packages: int
    density: float
    average_fan_out: float
    is_acyclic: bool
    connected_components: int
    largest_component: int
    isolated_files: int
    isolated_examples: list[str]
    important_modules: list[ImportantModule]
    heaviest_importers: list[ImportantModule]
    top_external_packages: list[PackageUse]
    circular_dependencies: list[CycleGroup]
    cycle_note: str
    entry_candidates: list[str]


class FileRelations(CamelModel):
    path: str
    language: str | None
    imports: list[str]
    imported_by: list[str]
    external_packages: list[str]
    transitive_dependencies: int
    transitive_dependents: int
    transitive_dependency_files: list[str]
    transitive_dependent_files: list[str]
    in_cycle: bool
    cycle_with: list[str]
