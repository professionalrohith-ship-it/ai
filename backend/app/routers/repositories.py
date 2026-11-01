from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from .. import schemas
from ..errors import ApiError
from ..queries import clean_relative_path
from ..repo_service import RepositoryRow, validate_path
from ..scanner.gitinfo import read_git_info

router = APIRouter(prefix="/api", tags=["repositories"])


def _repo_out(row: RepositoryRow, parsed_at: str | None = None) -> schemas.RepositoryOut:
    return schemas.RepositoryOut(
        id=row.id, name=row.name, path=row.path, description=row.description, languages=row.languages,
        frameworks=row.frameworks, last_analysed=row.last_scanned_at, file_count=row.file_count,
        folder_count=row.folder_count, main_language=row.main_language, added_at=row.added_at,
        status=row.status, is_git=row.is_git, branch=row.branch, commit=row.commit, last_error=row.last_error,
        parsed=parsed_at is not None, last_parsed_at=parsed_at,
    )


def _parsed_at(request: Request) -> dict[str, str]:
    """repository id -> finish time of its latest completed parse run."""
    with request.app.state.db.session() as conn:
        rows = conn.execute(
            "SELECT repository_id, MAX(finished_at) FROM parse_runs WHERE status='completed' GROUP BY repository_id"
        ).fetchall()
    return {r[0]: r[1] for r in rows}


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ---- registration ----------------------------------------------------------------------------
@router.post("/repositories/validate", response_model=schemas.PathValidationResult)
def validate(body: schemas.PathCheckRequest, request: Request):
    try:
        valid = validate_path(body.path)
    except ApiError as exc:
        return schemas.PathValidationResult(valid=False, message=exc.message)
    if any(r.path == str(valid.resolved) for r in request.app.state.repos.list()):
        return schemas.PathValidationResult(
            valid=False, message="This folder is already registered.", normalized_path=str(valid.resolved)
        )
    git = read_git_info(valid.resolved)
    message = "Git repository found." if git.is_git else "Folder is readable (not a Git repository)."
    return schemas.PathValidationResult(valid=True, message=message, normalized_path=str(valid.resolved), is_git=git.is_git)


@router.post("/repositories", response_model=schemas.RepositoryOut, status_code=201)
def register(body: schemas.RepositoryCreate, request: Request):
    return _repo_out(request.app.state.repos.register(body.path, body.name, body.description))


@router.get("/repositories", response_model=list[schemas.RepositoryOut])
def list_repositories(request: Request):
    parsed = _parsed_at(request)
    return [_repo_out(r, parsed.get(r.id)) for r in request.app.state.repos.list()]


@router.get("/repositories/{repo_id}", response_model=schemas.RepositoryOut)
def get_repository(repo_id: str, request: Request):
    return _repo_out(request.app.state.repos.get(repo_id), _parsed_at(request).get(repo_id))


@router.delete("/repositories/{repo_id}", status_code=204)
def delete_repository(repo_id: str, request: Request):
    request.app.state.repos.delete(repo_id)
    return Response(status_code=204)


# ---- scans -----------------------------------------------------------------------------------
@router.post("/repositories/{repo_id}/scans", response_model=schemas.ScanProgressOut, status_code=202)
def start_scan(repo_id: str, request: Request, body: schemas.ScanStart | None = None):
    excludes = tuple(p.strip() for p in (body.extra_excludes if body else []) if p.strip())
    scan_id = request.app.state.scans.start(repo_id, excludes)
    return request.app.state.queries.scan_progress(scan_id=scan_id)


@router.get("/repositories/{repo_id}/scans/latest", response_model=schemas.ScanProgressOut)
def latest_scan(repo_id: str, request: Request):
    return request.app.state.queries.scan_progress(repo_id=repo_id)


@router.get("/scans/{scan_id}", response_model=schemas.ScanProgressOut)
def scan_progress(scan_id: str, request: Request):
    return request.app.state.queries.scan_progress(scan_id=scan_id)


# ---- results ---------------------------------------------------------------------------------
@router.get("/repositories/{repo_id}/scan-result", response_model=schemas.ScanResultOut)
def scan_result(repo_id: str, request: Request):
    return request.app.state.queries.result(repo_id)


@router.get("/repositories/{repo_id}/languages", response_model=list[schemas.LanguageStat])
def languages(repo_id: str, request: Request):
    return request.app.state.queries.languages(repo_id)


@router.get("/repositories/{repo_id}/technologies", response_model=list[schemas.TechnologyOut])
def technologies(repo_id: str, request: Request):
    return request.app.state.queries.technologies(repo_id)


@router.get("/repositories/{repo_id}/tree", response_model=list[schemas.TreeNode])
def tree(
    repo_id: str,
    request: Request,
    path: str = Query("", max_length=1024),
    depth: int = Query(64, ge=1, le=64),
):
    return request.app.state.queries.tree(repo_id, clean_relative_path(path), depth)


@router.get("/repositories/{repo_id}/files", response_model=schemas.FilePage)
def files(
    repo_id: str,
    request: Request,
    category: str | None = None,
    language: str | None = Query(None, max_length=40),
    q: str | None = Query(None, max_length=200),
    entry_points: bool = Query(False, alias="entryPoints"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    return request.app.state.queries.files(repo_id, category, language, q, entry_points, limit, offset)
