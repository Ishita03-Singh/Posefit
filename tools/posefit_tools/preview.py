"""Renders all templates as a contact sheet PNG for visual review.

Run:  uv run python -m posefit_tools.preview [--out out/preview.png] [--dir ../shared/templates]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from .starter_poses import TEMPLATES_DIR
from .template import PoseTemplate

CELL_W, CELL_H, MARGIN, LABEL_H, COLS = 280, 380, 28, 44, 4

# BGR, matching the app overlay: person's left = blue, right = orange.
COLORS = {"left": (247, 195, 79), "right": (101, 138, 255), "center": (235, 235, 235)}

BONES: list[tuple[str, str, str]] = [
    ("left_shoulder", "right_shoulder", "center"),
    ("left_hip", "right_hip", "center"),
    ("left_shoulder", "left_hip", "left"),
    ("right_shoulder", "right_hip", "right"),
    ("left_shoulder", "left_elbow", "left"),
    ("left_elbow", "left_wrist", "left"),
    ("right_shoulder", "right_elbow", "right"),
    ("right_elbow", "right_wrist", "right"),
    ("left_hip", "left_knee", "left"),
    ("left_knee", "left_ankle", "left"),
    ("right_hip", "right_knee", "right"),
    ("right_knee", "right_ankle", "right"),
    ("left_ankle", "left_heel", "left"),
    ("left_heel", "left_foot_index", "left"),
    ("left_ankle", "left_foot_index", "left"),
    ("right_ankle", "right_heel", "right"),
    ("right_heel", "right_foot_index", "right"),
    ("right_ankle", "right_foot_index", "right"),
    ("left_ear", "left_eye", "left"),
    ("right_ear", "right_eye", "right"),
    ("left_eye", "nose", "left"),
    ("right_eye", "nose", "right"),
]


def draw_cell(t: PoseTemplate) -> np.ndarray:
    cell = np.full((CELL_H, CELL_W, 3), 28, np.uint8)
    pts = np.array(list(t.keypoints.values()))
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    area_w, area_h = CELL_W - 2 * MARGIN, CELL_H - LABEL_H - 2 * MARGIN
    scale = min(area_w / max(hi[0] - lo[0], 1e-6), area_h / max(hi[1] - lo[1], 1e-6))
    offset = np.array([MARGIN, MARGIN]) + (np.array([area_w, area_h]) - (hi - lo) * scale) / 2

    def px(name: str) -> tuple[int, int]:
        x, y = (np.array(t.keypoints[name]) - lo) * scale + offset
        return int(x), int(y)

    # Head circle and neck make the figure readable; they are not part of the template data.
    kp = t.keypoints
    if "nose" in kp:
        if "left_ear" in kp and "right_ear" in kp:
            center = (
                np.array(kp["left_ear"]) + np.array(kp["right_ear"]) + np.array(kp["nose"])
            ) / 3
            radius = np.linalg.norm(np.array(kp["left_ear"]) - np.array(kp["right_ear"])) * 0.62
        else:
            center, radius = np.array(kp["nose"]), 0.19
        c = (center - lo) * scale + offset
        cv2.circle(cell, (int(c[0]), int(c[1])), int(radius * scale), (90, 90, 90), 2, cv2.LINE_AA)
        neck_base = (np.array(kp["left_shoulder"]) + np.array(kp["right_shoulder"])) / 2
        n = (neck_base - lo) * scale + offset
        chin = c + (np.array([0, radius]) * scale)
        cv2.line(
            cell, (int(n[0]), int(n[1])), (int(chin[0]), int(chin[1])), (90, 90, 90), 2, cv2.LINE_AA
        )

    for a, b, side in BONES:
        if a in t.keypoints and b in t.keypoints:
            cv2.line(cell, px(a), px(b), COLORS[side], 3, cv2.LINE_AA)
    for name in t.keypoints:
        is_key = name in t.key_joints
        cv2.circle(
            cell,
            px(name),
            6 if is_key else 4,
            (80, 220, 120) if is_key else (255, 255, 255),
            -1,
            cv2.LINE_AA,
        )

    cv2.putText(
        cell,
        t.name,
        (10, CELL_H - 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        cell,
        f"{t.shot} / {t.frame}",
        (10, CELL_H - 8),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.4,
        (160, 160, 160),
        1,
        cv2.LINE_AA,
    )
    return cell


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=TEMPLATES_DIR)
    parser.add_argument("--out", type=Path, default=Path("out/preview.png"))
    args = parser.parse_args()

    templates = [PoseTemplate.load(p) for p in sorted(args.dir.glob("*.json"))]
    if not templates:
        raise SystemExit(f"no templates in {args.dir}")
    cells = [draw_cell(t) for t in templates]
    while len(cells) % COLS:
        cells.append(np.full_like(cells[0], 18))
    rows = [np.hstack(cells[i : i + COLS]) for i in range(0, len(cells), COLS)]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.out), np.vstack(rows))
    print(f"wrote {args.out} ({len(templates)} templates)")


if __name__ == "__main__":
    main()
