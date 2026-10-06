"""Pose template format (v1) and keypoint normalization.

A template is a set of 2D keypoints in a body-relative frame, so it can later be
scaled, rotated and moved onto any person in the camera view (Phase 3).

Coordinates: image orientation (x right, y down), as seen in a non-mirrored photo of a
person facing the camera, so the person's left side is on the image right.

Normalization (see `normalize`):
- frame "torso": origin = mid-hip, unit = torso length (mid-shoulder to mid-hip).
- frame "head":  used when hips are not visible (half body, selfies). origin = mid-shoulder,
  unit = nose-to-mid-shoulder distance / HEAD_TO_TORSO, which approximates torso length,
  so both frames have roughly the same scale.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SCHEMA_VERSION = 1

# Subset of MediaPipe's 33 landmarks that defines a pose. Inner/outer eyes, mouth and
# finger points are left out: they add noise without changing what the pose looks like.
TEMPLATE_KEYPOINTS: tuple[str, ...] = (
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
)

# Typical nose-to-mid-shoulder distance as a fraction of torso length.
HEAD_TO_TORSO = 0.45

Shot = Literal["full_body", "half_body", "selfie"]
Frame = Literal["torso", "head"]
Point = tuple[float, float]

_ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class Source(BaseModel):
    kind: Literal["generated", "photo"]
    # Filename or URL the pose was taken from. The image itself is never stored.
    ref: str | None = None


class PoseTemplate(BaseModel):
    schema_version: int = SCHEMA_VERSION
    id: str
    name: str
    description: str = ""
    shot: Shot
    tags: list[str] = Field(default_factory=list)
    frame: Frame
    keypoints: dict[str, Point]
    # Joints that define the pose; matching (Phase 3) weights these higher.
    key_joints: list[str] = Field(default_factory=list)
    source: Source

    @field_validator("id")
    @classmethod
    def _id_is_kebab(cls, v: str) -> str:
        if not _ID_PATTERN.match(v):
            raise ValueError(f"id must be kebab-case: {v!r}")
        return v

    @field_validator("keypoints")
    @classmethod
    def _known_keypoints(cls, v: dict[str, Point]) -> dict[str, Point]:
        unknown = set(v) - set(TEMPLATE_KEYPOINTS)
        if unknown:
            raise ValueError(f"unknown keypoints: {sorted(unknown)}")
        if not {"left_shoulder", "right_shoulder"} <= set(v):
            raise ValueError("both shoulders are required")
        # Keep a stable key order so diffs of template files stay readable.
        return {
            name: (round(v[name][0], 4), round(v[name][1], 4))
            for name in TEMPLATE_KEYPOINTS
            if name in v
        }

    @model_validator(mode="after")
    def _key_joints_present(self) -> PoseTemplate:
        missing = set(self.key_joints) - set(self.keypoints)
        if missing:
            raise ValueError(f"key_joints not in keypoints: {sorted(missing)}")
        return self

    def save(self, directory: Path) -> Path:
        path = directory / f"{self.id}.json"
        path.write_text(self.model_dump_json(indent=2) + "\n", encoding="utf-8", newline="\n")
        return path

    @classmethod
    def load(cls, path: Path) -> PoseTemplate:
        return cls.model_validate(json.loads(path.read_text(encoding="utf-8")))


def _mid(a: Point, b: Point) -> Point:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def normalize(points: dict[str, Point]) -> tuple[Frame, dict[str, Point]]:
    """Moves and scales keypoints (in any isotropic unit, e.g. pixels) into the template frame."""
    if not {"left_shoulder", "right_shoulder"} <= set(points):
        raise ValueError("cannot normalize a pose without both shoulders")
    mid_shoulder = _mid(points["left_shoulder"], points["right_shoulder"])

    frame: Frame
    if {"left_hip", "right_hip"} <= set(points):
        frame = "torso"
        origin = _mid(points["left_hip"], points["right_hip"])
        unit = _dist(mid_shoulder, origin)
    elif "nose" in points:
        frame = "head"
        origin = mid_shoulder
        unit = _dist(points["nose"], mid_shoulder) / HEAD_TO_TORSO
    else:
        raise ValueError("cannot normalize a pose without hips or nose")

    if unit < 1e-6:
        raise ValueError("degenerate pose: reference distance is zero")
    return frame, {
        name: ((p[0] - origin[0]) / unit, (p[1] - origin[1]) / unit) for name, p in points.items()
    }


def infer_shot(points: dict[str, Point]) -> Shot:
    """Guesses the shot type from which body parts are present."""
    has = set(points)
    if {"left_knee", "right_knee"} & has and {"left_ankle", "right_ankle"} & has:
        return "full_body"
    if {"left_hip", "right_hip"} & has:
        return "half_body"
    return "selfie"


SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "pose-template.schema.json"


def schema_json() -> str:
    return json.dumps(PoseTemplate.model_json_schema(), indent=2) + "\n"


if __name__ == "__main__":
    SCHEMA_PATH.write_text(schema_json(), encoding="utf-8", newline="\n")
    print(f"wrote {SCHEMA_PATH.name}")
