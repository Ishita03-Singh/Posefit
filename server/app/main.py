from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.search.routes import router as search_router

app = FastAPI(title="PoseFit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}
