from __future__ import annotations

from fastapi import APIRouter, Query, Request

from ..intelligence import graph as graph_analysis
from ..intelligence import schemas
from ..intelligence.code_access import read_section
from ..queries import clean_relative_path

router = APIRouter(prefix="/api", tags=["code intelligence"])


# ---- parsing runs ----------------------------------------------------------------------------
@router.post("/repositories/{repo_id}/parse", response_model=schemas.ParseRunOut, status_code=202)
def start_parse(repo_id: str, request: Request, body: schemas.ParseStart | None = None):
    run_id = request.app.state.parser.start(repo_id, force=bool(body and body.force))
    return request.app.state.intel.run_status(run_id=run_id)


@router.get("/repositories/{repo_id}/parse/latest", response_model=schemas.ParseRunOut)
def latest_parse(repo_id: str, request: Request):
    return request.app.state.intel.run_status(repo_id=repo_id)


@router.get("/parse-runs/{run_id}", response_model=schemas.ParseRunOut)
def parse_run(run_id: str, request: Request):
    return request.app.state.intel.run_status(run_id=run_id)


# ---- files and symbols -----------------------------------------------------------------------
@router.get("/repositories/{repo_id}/parsed-files", response_model=schemas.ParsedFilePage)
def parsed_files(
    repo_id: str,
    request: Request,
    status: str | None = None,
    language: str | None = Query(None, max_length=40),
    q: str | None = Query(None, max_length=200),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    return request.app.state.intel.parsed_files(repo_id, status, language, q, limit, offset)


@router.get("/repositories/{repo_id}/symbols", response_model=schemas.SymbolPage)
def search_symbols(
    repo_id: str,
    request: Request,
    q: str | None = Query(None, max_length=200, description="symbol name (substring, case-insensitive)"),
    kind: str | None = Query(None, description="comma separated: class,function,method,..."),
    language: str | None = Query(None, max_length=40),
    path: str | None = Query(None, max_length=1024),
    exact: bool = False,
    exported: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    intel = request.app.state.intel
    return intel.symbols(repo_id, q, intel.parse_kinds(kind), language, clean_relative_path(path) if path else None,
                         exact, exported, limit, offset)


def _group(group: str):
    def endpoint(
        repo_id: str,
        request: Request,
        q: str | None = Query(None, max_length=200),
        language: str | None = Query(None, max_length=40),
        path: str | None = Query(None, max_length=1024),
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        intel = request.app.state.intel
        return intel.symbols(repo_id, q, intel.kinds_for(group), language, clean_relative_path(path) if path else None,
                             False, None, limit, offset)

    return endpoint


router.add_api_route("/repositories/{repo_id}/classes", _group("classes"), methods=["GET"], response_model=schemas.SymbolPage)
router.add_api_route("/repositories/{repo_id}/functions", _group("functions"), methods=["GET"], response_model=schemas.SymbolPage)


@router.get("/repositories/{repo_id}/structure", response_model=schemas.FileStructure)
def file_structure(repo_id: str, request: Request, path: str = Query(..., min_length=1, max_length=1024)):
    return request.app.state.intel.structure(repo_id, clean_relative_path(path))


# ---- imports and dependencies ----------------------------------------------------------------
@router.get("/repositories/{repo_id}/imports", response_model=schemas.ImportPage)
def imports(
    repo_id: str,
    request: Request,
    path: str | None = Query(None, max_length=1024),
    dep_type: str | None = Query(None, alias="type"),
    q: str | None = Query(None, max_length=200),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    return request.app.state.intel.imports(repo_id, clean_relative_path(path) if path else None, dep_type, q, limit, offset)


@router.get("/repositories/{repo_id}/dependencies", response_model=schemas.DependencySummary)
def dependencies(repo_id: str, request: Request):
    return request.app.state.intel.dependency_summary(repo_id)


@router.get("/repositories/{repo_id}/dependency-graph", response_model=schemas.DependencyGraph)
def dependency_graph(
    repo_id: str,
    request: Request,
    types: str | None = Query(None, description="comma separated: internal,external,stdlib,unresolved"),
    relations: bool = Query(False, description="also add extends/implements/uses edges between files"),
    limit: int = Query(20000, ge=1, le=100000),
):
    intel = request.app.state.intel
    return intel.graph(repo_id, intel.parse_types(types), relations, limit)


# ---- symbol detail, references, code sections ------------------------------------------------
MAX_SNIPPET_LINES = 200


def _section(request: Request, repo_id: str, path: str, start: int, end: int) -> dict:
    repo = request.app.state.repos.get(repo_id)
    return read_section(request.app.state.db, repo_id, repo.path, path, start, end,
                        request.app.state.settings.max_file_bytes)


@router.get("/repositories/{repo_id}/symbols/{symbol_id}", response_model=schemas.SymbolDetail)
def symbol_detail(repo_id: str, symbol_id: int, request: Request,
                  context: int = Query(0, ge=0, le=20, description="extra lines before/after the definition")):
    symbol = request.app.state.intel.symbol(repo_id, symbol_id)
    start = max(1, symbol["start_line"] - context)
    end = symbol["end_line"] + context
    truncated = end - start + 1 > MAX_SNIPPET_LINES
    code = _section(request, repo_id, symbol["path"], start, min(end, start + MAX_SNIPPET_LINES - 1))
    return {"symbol": symbol, "code": code, "code_truncated": truncated}


@router.get("/repositories/{repo_id}/symbols/{symbol_id}/references", response_model=schemas.SymbolReferences)
def symbol_references(repo_id: str, symbol_id: int, request: Request, limit: int = Query(100, ge=1, le=500)):
    return request.app.state.intel.references(repo_id, symbol_id, limit)


@router.get("/repositories/{repo_id}/code", response_model=schemas.CodeSection)
def code_section(repo_id: str, request: Request, path: str = Query(..., min_length=1, max_length=1024),
                 start: int = Query(1, ge=1), end: int = Query(80, ge=1)):
    return _section(request, repo_id, clean_relative_path(path), start, end)


# ---- NetworkX analysis -----------------------------------------------------------------------
@router.get("/repositories/{repo_id}/graph/stats", response_model=schemas.GraphStats)
def graph_stats(repo_id: str, request: Request):
    request.app.state.repos.get(repo_id)
    return graph_analysis.graph_stats(request.app.state.db, repo_id)


@router.get("/repositories/{repo_id}/graph/file", response_model=schemas.FileRelations)
def graph_file(repo_id: str, request: Request, path: str = Query(..., min_length=1, max_length=1024)):
    request.app.state.repos.get(repo_id)
    return graph_analysis.file_relations(request.app.state.db, repo_id, clean_relative_path(path))
