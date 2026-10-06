from __future__ import annotations

from app.search.embeddings import TextEmbedder, pose_text
from app.search.index import Hit, PoseIndex, PoseRow
from app.search.pose_vector import pose_vector


class SearchService:
    def __init__(self, index: PoseIndex, embedder: TextEmbedder) -> None:
        self.index = index
        self.embedder = embedder

    def ingest(self, templates: list[dict]) -> int:
        templates = [t for t in templates if "system" not in t.get("tags", [])]
        if not templates:
            return 0
        embeddings = self.embedder.embed([pose_text(t) for t in templates])
        self.index.upsert(
            [
                PoseRow(t, emb, pose_vector(t["keypoints"]))
                for t, emb in zip(templates, embeddings, strict=True)
            ]
        )
        return len(templates)

    def search_text(self, query: str, k: int = 10, shot: str | None = None) -> list[Hit]:
        return self.index.search_text(self.embedder.embed([query])[0], k, shot)

    def search_pose(
        self, keypoints: dict[str, tuple[float, float]], k: int = 10, shot: str | None = None
    ) -> list[Hit]:
        return self.index.search_pose(pose_vector(keypoints), k, shot)
