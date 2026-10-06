from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import settings
from app.search.embeddings import FastEmbedder
from app.search.index import Hit, PgVectorIndex
from app.search.service import SearchService

router = APIRouter(prefix="/api/search", tags=["search"])

Shot = Literal["full_body", "half_body", "selfie"]


@lru_cache
def _service() -> SearchService:
    return SearchService(PgVectorIndex(settings.database_url), FastEmbedder())


def get_service() -> SearchService:
    try:
        return _service()
    except Exception as err:  # database not running / not reachable
        raise HTTPException(503, "Search database unavailable") from err


class Result(BaseModel):
    template: dict
    score: float


class SearchResponse(BaseModel):
    results: list[Result]


class PoseQuery(BaseModel):
    """Pose keypoints in template units. Only these numbers are sent, never a photo."""

    keypoints: dict[str, tuple[float, float]] = Field(min_length=2)
    shot: Shot | None = None
    k: int = Field(10, ge=1, le=50)


def _response(hits: list[Hit]) -> SearchResponse:
    return SearchResponse(results=[Result(template=h.template, score=h.score) for h in hits])


Service = Annotated[SearchService, Depends(get_service)]


@router.get("", response_model=SearchResponse)
def search_text(
    service: Service,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    shot: Shot | None = None,
    k: Annotated[int, Query(ge=1, le=50)] = 10,
) -> SearchResponse:
    """Semantic search over pose descriptions: "candid cafe pose sitting"."""
    return _response(service.search_text(q, k, shot))


@router.post("/pose", response_model=SearchResponse)
def search_pose(service: Service, query: PoseQuery) -> SearchResponse:
    """Poses shaped like the given one (e.g. extracted on the phone from an inspiration photo)."""
    return _response(service.search_pose(query.keypoints, query.k, query.shot))
