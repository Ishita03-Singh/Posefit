"""Embeds the pose template library into the pgvector catalogue.

Run (with the database up: `docker compose up -d db` in the repo root):
    uv run python -m app.search.ingest
"""

from __future__ import annotations

import json

from app.config import settings
from app.search.embeddings import FastEmbedder
from app.search.index import PgVectorIndex
from app.search.service import SearchService


def main() -> None:
    if not settings.database_url:
        raise SystemExit("Set POSEFIT_DATABASE_URL (copy .env.example to .env in the repo root)")
    files = sorted(settings.templates_dir.glob("*.json"))
    templates = [json.loads(f.read_text(encoding="utf-8")) for f in files]
    service = SearchService(PgVectorIndex(settings.database_url), FastEmbedder())
    n = service.ingest(templates)
    print(f"ingested {n} poses ({service.index.count()} in catalogue)")


if __name__ == "__main__":
    main()
