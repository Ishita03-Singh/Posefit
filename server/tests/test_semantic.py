"""Real-model checks: semantic search should understand meaning, not just shared words."""

import pytest

from app.search.embeddings import CACHE_DIR, FastEmbedder
from app.search.index import InMemoryIndex
from app.search.service import SearchService

pytestmark = pytest.mark.skipif(
    not CACHE_DIR.exists(), reason="embedding model not downloaded (run the server once)"
)


def test_meaning_not_keywords(templates) -> None:
    service = SearchService(InMemoryIndex(), FastEmbedder())
    service.ingest(templates)

    def top(q: str, n: int = 3) -> list[str]:
        return [h.template["id"] for h in service.search_text(q, n)]

    # "coffee shop" never appears in any pose text; "cafe" does.
    assert "chin-rest" in top("relaxed photo at a coffee shop")
    # "stairs" never appears; "steps" does.
    assert "seated-steps" in top("sitting on the stairs")
    # "jump for joy on holiday" ~ energetic, travel, beach.
    assert "victory-arms-up" in top("jump for joy on holiday")
