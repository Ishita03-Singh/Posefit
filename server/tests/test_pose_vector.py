import math

import pytest

from app.search.pose_vector import DIM, cosine, pose_vector

# Same fixture and expected numbers as app/src/search/poseVector.test.ts (keeps both in sync).
SIMPLE = {
    "left_shoulder": (0.4, -1.0),
    "right_shoulder": (-0.4, -1.0),
    "left_hip": (0.2, 0.0),
    "right_hip": (-0.2, 0.0),
    "nose": (0.0, -1.45),
    "left_elbow": (0.4, -0.4),
    "left_wrist": (0.4, 0.1),
    "right_elbow": (-0.4, -1.6),
}
S = 1 / math.sqrt(5)
SIMPLE_VECTOR = [0, -S, 0, -S, 0, S, 0, S, 0, -S] + [0.0] * 10


def test_vector_is_unit_bone_directions_with_zeros_for_missing_bones() -> None:
    v = pose_vector(SIMPLE)
    assert len(v) == DIM
    assert v == pytest.approx(SIMPLE_VECTOR)


def test_size_and_position_do_not_matter() -> None:
    moved = {k: (p[0] * 3 + 10, p[1] * 3 - 5) for k, p in SIMPLE.items()}
    assert cosine(pose_vector(SIMPLE), pose_vector(moved)) == pytest.approx(1.0)


def test_starter_poses_are_most_similar_to_themselves(templates) -> None:
    vectors = {t["id"]: pose_vector(t["keypoints"]) for t in templates}
    for tid, v in vectors.items():
        best = max(vectors, key=lambda other: cosine(v, vectors[other]))
        assert best == tid
