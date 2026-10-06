import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.search.index import InMemoryIndex
from app.search.routes import get_service
from app.search.service import SearchService
from tests.conftest import FakeEmbedder


@pytest.fixture
def client(templates):
    service = SearchService(InMemoryIndex(), FakeEmbedder())
    assert service.ingest(templates) == len(templates) - 1  # the system scan pose is skipped
    app.dependency_overrides[get_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_text_search(client) -> None:
    r = client.get("/api/search", params={"q": "sitting on steps"})
    assert r.status_code == 200
    assert r.json()["results"][0]["template"]["id"] == "seated-steps"


def test_text_search_filters_by_shot(client) -> None:
    results = client.get("/api/search", params={"q": "pose", "shot": "selfie"}).json()["results"]
    assert results and all(r["template"]["shot"] == "selfie" for r in results)


def test_pose_search_finds_the_same_pose(client, templates) -> None:
    hand_on_hip = next(t for t in templates if t["id"] == "classic-hand-on-hip")
    r = client.post("/api/search/pose", json={"keypoints": hand_on_hip["keypoints"], "k": 3})
    assert r.status_code == 200
    top = r.json()["results"][0]
    assert top["template"]["id"] == "classic-hand-on-hip"
    assert top["score"] == pytest.approx(1.0)


def test_validates_input(client) -> None:
    assert client.get("/api/search", params={"q": ""}).status_code == 422
    assert client.post("/api/search/pose", json={"keypoints": {}}).status_code == 422


def test_reports_database_unavailable() -> None:
    from fastapi import HTTPException

    def down():
        raise HTTPException(503, "Search database unavailable")

    app.dependency_overrides[get_service] = down
    try:
        assert TestClient(app).get("/api/search", params={"q": "x"}).status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_reports_database_not_configured(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "database_url", None)
    r = TestClient(app).get("/api/search", params={"q": "x"})
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"]
