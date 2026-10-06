import hashlib
import json
import re

import pytest

from app.config import settings


class FakeEmbedder:
    """Deterministic bag-of-words hashing: exercises the pipeline without downloading a model."""

    dim = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            v = [0.0] * self.dim
            for word in re.findall(r"[a-z]+", text.lower()):
                v[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dim] += 1.0
            out.append(v)
        return out


@pytest.fixture
def templates() -> list[dict]:
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(settings.templates_dir.glob("*.json"))
    ]
