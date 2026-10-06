"""Pose-shape vectors: what "poses like this one" compares.

A pose becomes the unit direction of 10 body bones (20 numbers). Directions ignore body size
and proportions, and need no ML model. The app computes the identical vector
(app/src/search/poseVector.ts), so a photo search only ever sends these numbers, never the photo.
"""

from __future__ import annotations

import math

Point = tuple[float, float]

# (from, to); "mid_hip" / "mid_shoulder" are midpoints of the left/right joints.
BONES: tuple[tuple[str, str], ...] = (
    ("mid_hip", "mid_shoulder"),
    ("mid_shoulder", "nose"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
)

DIM = 2 * len(BONES)


def _get(kp: dict[str, Point], name: str) -> Point | None:
    if name.startswith("mid_"):
        part = name[4:]
        a, b = kp.get(f"left_{part}"), kp.get(f"right_{part}")
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) if a and b else None
    p = kp.get(name)
    return (p[0], p[1]) if p else None


def pose_vector(keypoints: dict[str, Point]) -> list[float]:
    """Unit bone directions (zeros for bones not in the pose), scaled to unit length overall."""
    out: list[float] = []
    for a, b in BONES:
        pa, pb = _get(keypoints, a), _get(keypoints, b)
        if pa is None or pb is None:
            out += [0.0, 0.0]
            continue
        dx, dy = pb[0] - pa[0], pb[1] - pa[1]
        n = math.hypot(dx, dy)
        out += [dx / n, dy / n] if n > 1e-9 else [0.0, 0.0]
    total = math.sqrt(sum(v * v for v in out))
    return [v / total for v in out] if total > 0 else out


def cosine(a: list[float], b: list[float]) -> float:
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b, strict=True)) / (na * nb) if na and nb else 0.0
