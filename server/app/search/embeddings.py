"""Text embeddings for semantic pose search.

Open-source all-MiniLM-L6-v2 (384-d, ~90 MB) through fastembed: ONNX Runtime on CPU, no
PyTorch or GPU, ~1-2 ms per query. Kept behind a tiny protocol so a hosted provider (or a fake
in tests) can be swapped in.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "fastembed"


class TextEmbedder(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedder:
    dim = 384

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self.model_name = model_name
        self._model = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:  # loads (and on first use downloads) the model lazily
            from fastembed import TextEmbedding

            self._model = TextEmbedding(self.model_name, cache_dir=str(CACHE_DIR))
        return [v.tolist() for v in self._model.embed(texts)]


def pose_text(template: dict) -> str:
    """What a pose "means" in words: the text that gets embedded for semantic search."""
    shot = template.get("shot", "").replace("_", " ")
    tags = ", ".join(template.get("tags", []))
    return f"{template['name']}. {template.get('description', '')} Shot: {shot}. Tags: {tags}."
