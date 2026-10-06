"""Vector index for the shared pose catalogue: pgvector in production, in-memory for tests."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from app.search.pose_vector import DIM

TEXT_DIM = 384


@dataclass
class PoseRow:
    template: dict
    text_embedding: list[float]
    pose_vector: list[float]

    @property
    def id(self) -> str:
        return self.template["id"]


@dataclass
class Hit:
    template: dict
    score: float  # cosine similarity, 1 = identical


class PoseIndex(Protocol):
    def upsert(self, rows: list[PoseRow]) -> None: ...
    def search_text(self, vector: list[float], k: int, shot: str | None) -> list[Hit]: ...
    def search_pose(self, vector: list[float], k: int, shot: str | None) -> list[Hit]: ...
    def count(self) -> int: ...


class InMemoryIndex:
    """Brute-force cosine search; the same thing the app does on the phone for its own poses."""

    def __init__(self) -> None:
        self.rows: dict[str, PoseRow] = {}

    def upsert(self, rows: list[PoseRow]) -> None:
        self.rows.update({r.id: r for r in rows})

    def _search(self, vector: list[float], k: int, shot: str | None, field: str) -> list[Hit]:
        q = np.asarray(vector, dtype=float)
        hits = []
        for r in self.rows.values():
            if shot and r.template.get("shot") != shot:
                continue
            v = np.asarray(getattr(r, field), dtype=float)
            denom = np.linalg.norm(q) * np.linalg.norm(v)
            hits.append(Hit(r.template, float(q @ v / denom) if denom else 0.0))
        return sorted(hits, key=lambda h: -h.score)[:k]

    def search_text(self, vector: list[float], k: int, shot: str | None) -> list[Hit]:
        return self._search(vector, k, shot, "text_embedding")

    def search_pose(self, vector: list[float], k: int, shot: str | None) -> list[Hit]:
        return self._search(vector, k, shot, "pose_vector")

    def count(self) -> int:
        return len(self.rows)


SCHEMA = f"""
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS poses (
    id             text PRIMARY KEY,
    name           text NOT NULL,
    shot           text NOT NULL,
    tags           text[] NOT NULL DEFAULT '{{}}',
    template       jsonb NOT NULL,
    text_embedding vector({TEXT_DIM}) NOT NULL,
    pose_vector    vector({DIM}) NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now()
);
-- HNSW: approximate nearest-neighbour indexes, fast at catalogue sizes far beyond what a
-- phone holds. Cosine distance (<=>) matches how both kinds of vectors are compared.
CREATE INDEX IF NOT EXISTS poses_text_hnsw ON poses USING hnsw (text_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS poses_pose_hnsw ON poses USING hnsw (pose_vector vector_cosine_ops);
CREATE INDEX IF NOT EXISTS poses_shot ON poses (shot);
"""


class PgVectorIndex:
    def __init__(self, database_url: str) -> None:
        import psycopg
        from pgvector.psycopg import register_vector
        from psycopg_pool import ConnectionPool

        # The extension must exist before the vector type can be registered on connections.
        with psycopg.connect(database_url, autocommit=True) as conn:
            conn.execute(SCHEMA)
        self.pool = ConnectionPool(
            database_url, min_size=1, max_size=4, configure=register_vector, open=True
        )

    def upsert(self, rows: list[PoseRow]) -> None:
        with self.pool.connection() as conn:
            conn.cursor().executemany(
                """
                INSERT INTO poses (id, name, shot, tags, template, text_embedding, pose_vector)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, shot = EXCLUDED.shot, tags = EXCLUDED.tags,
                    template = EXCLUDED.template, text_embedding = EXCLUDED.text_embedding,
                    pose_vector = EXCLUDED.pose_vector, updated_at = now()
                """,
                [
                    (
                        r.id,
                        r.template["name"],
                        r.template["shot"],
                        r.template.get("tags", []),
                        json.dumps(r.template),
                        np.asarray(r.text_embedding),
                        np.asarray(r.pose_vector),
                    )
                    for r in rows
                ],
            )

    def _search(self, column: str, vector: list[float], k: int, shot: str | None) -> list[Hit]:
        # `column` is one of two fixed names, never user input.
        sql = f"""
            SELECT template, 1 - ({column} <=> %(q)s) AS score
            FROM poses
            WHERE %(shot)s::text IS NULL OR shot = %(shot)s
            ORDER BY {column} <=> %(q)s
            LIMIT %(k)s
        """
        with self.pool.connection() as conn:
            rows = conn.execute(sql, {"q": np.asarray(vector), "shot": shot, "k": k}).fetchall()
        return [Hit(template, float(score)) for template, score in rows]

    def search_text(self, vector: list[float], k: int, shot: str | None) -> list[Hit]:
        return self._search("text_embedding", vector, k, shot)

    def search_pose(self, vector: list[float], k: int, shot: str | None) -> list[Hit]:
        return self._search("pose_vector", vector, k, shot)

    def count(self) -> int:
        with self.pool.connection() as conn:
            return conn.execute("SELECT count(*) FROM poses").fetchone()[0]
