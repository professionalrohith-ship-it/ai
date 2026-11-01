from __future__ import annotations

from fastapi import APIRouter, Query, Request

from .. import views
from ..queries import clean_relative_path

router = APIRouter(prefix="/api", tags=["views"])


@router.get("/repositories/{repo_id}/architecture")
def architecture(repo_id: str, request: Request):
    s = request.app.state
    return views.architecture_data(s.db, s.repos, repo_id)


@router.get("/repositories/{repo_id}/packages")
def packages(repo_id: str, request: Request):
    s = request.app.state
    repo = views.require_scanned(s.repos, repo_id)
    from ..ai.reader import RepoReader

    return views.packages_data(s.db, s.repos, RepoReader(s.db, repo_id, repo.path, s.settings.max_file_bytes), repo_id)


@router.get("/repositories/{repo_id}/file")
def file_content(repo_id: str, request: Request, path: str = Query(..., min_length=1, max_length=1024)):
    s = request.app.state
    return views.file_view(s.db, s.repos, repo_id, clean_relative_path(path), s.settings.max_file_bytes)


@router.get("/fs/suggestions")
def folder_suggestions():
    return views.fs_suggestions()
