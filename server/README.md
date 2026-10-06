# PoseFit server

FastAPI backend for the "slow loop": semantic pose search now; RAG coach and photoshoot agent later.

```sh
cp ../.env.example ../.env                   # once: set POSTGRES_PASSWORD (and the matching URL)
docker compose up -d db                       # from the repo root: Postgres + pgvector
uv sync
uv run python -m app.search.ingest            # embed shared/templates into pgvector
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                                 # pgvector test runs only when the db is up
```

| Endpoint | What |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/search?q=…&shot=…&k=…` | Semantic text search (MiniLM via fastembed) |
| `POST /api/search/pose` `{keypoints, shot?, k?}` | Poses with a similar shape (20-d limb-direction vector) |

The embedding model (~87 MB) downloads to `.cache/fastembed` on first use. Configuration via `POSEFIT_*` env vars or the repo-root `.env` (see `.env.example` and `app/config.py`). Nothing secret is committed.
