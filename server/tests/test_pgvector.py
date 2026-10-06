"""pgvector integration test; runs only when the dev database is up (docker compose up -d db)."""

import pytest

from app.config import settings
from app.search.index import PgVectorIndex
from app.search.service import SearchService
from tests.conftest import FakeEmbedder


def _db_available() -> bool:
    import psycopg

    try:
        with psycopg.connect(settings.database_url, connect_timeout=2):
            return True
    except psycopg.OperationalError:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="Postgres not running")


def test_round_trip_through_pgvector(templates) -> None:
    service = SearchService(PgVectorIndex(settings.database_url), FakeEmbedder())
    service.ingest(templates)
    hand_on_hip = next(t for t in templates if t["id"] == "classic-hand-on-hip")
    hits = service.search_pose(hand_on_hip["keypoints"], k=3)
    assert hits[0].template["id"] == "classic-hand-on-hip"
    assert hits[0].score == pytest.approx(1.0, abs=1e-5)
    assert [h.template["shot"] for h in service.search_text("pose", 5, "selfie")] == ["selfie"] * 2
