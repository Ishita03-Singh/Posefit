"""Turns reference photos into pose templates.

Run:
  # every image in a folder
  uv run python -m posefit_tools.extract reference_photos/
  # one image with metadata
  uv run python -m posefit_tools.extract reference_photos/cafe.jpg --name "Cafe lean" --tags sitting,cafe --source https://pin.it/...

Only keypoint coordinates are written to the template; the photo is never copied or stored.
A debug image with the detected keypoints is written to out/extract/ so you can check it.
"""

from __future__ import annotations

import argparse
import re
import urllib.request
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

from .starter_poses import TEMPLATES_DIR
from .template import TEMPLATE_KEYPOINTS, Point, PoseTemplate, Source, infer_shot, normalize

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MIN_VISIBILITY = 0.5
# MediaPipe landmark index for each template keypoint.
LANDMARK_INDEX = {
    name: i
    for i, name in enumerate(lm.name.lower() for lm in vision.PoseLandmark)
    if name in TEMPLATE_KEYPOINTS
}


class Landmark(Protocol):
    x: float
    y: float
    visibility: float | None


def keypoints_from_landmarks(
    landmarks: Sequence[Landmark], width: int, height: int, min_visibility: float = MIN_VISIBILITY
) -> dict[str, Point]:
    """Selects confident, in-frame template keypoints and converts them to pixels.

    Pixels (not MediaPipe's 0..1 coordinates) matter: x and y are normalized by different
    image dimensions, so distances are only meaningful after converting back.
    """
    points: dict[str, Point] = {}
    for name, index in LANDMARK_INDEX.items():
        lm = landmarks[index]
        if (lm.visibility or 0.0) < min_visibility:
            continue
        if not (-0.02 <= lm.x <= 1.02 and -0.02 <= lm.y <= 1.02):
            continue
        points[name] = (lm.x * width, lm.y * height)
    return points


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "pose"


def ensure_model() -> Path:
    path = MODELS_DIR / "pose_landmarker_heavy.task"
    if not path.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        print(f"downloading {path.name} ...")
        urllib.request.urlretrieve(MODEL_URL, path)
    return path


def collect_images(inputs: list[Path]) -> list[Path]:
    images: list[Path] = []
    for p in inputs:
        if p.is_dir():
            images += sorted(f for f in p.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        elif p.suffix.lower() in IMAGE_SUFFIXES:
            images.append(p)
        else:
            print(f"skip {p}: not an image")
    return images


def write_debug_image(image_bgr, points: dict[str, Point], path: Path) -> None:
    out = image_bgr.copy()
    radius = max(3, min(out.shape[:2]) // 120)
    for x, y in points.values():
        cv2.circle(out, (int(x), int(y)), radius, (80, 220, 120), -1, cv2.LINE_AA)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), out)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("inputs", nargs="+", type=Path, help="image files or folders")
    parser.add_argument("--name", help="display name (single image only); default from filename")
    parser.add_argument("--tags", default="", help="comma-separated tags, e.g. sitting,cafe")
    parser.add_argument(
        "--shot", choices=["full_body", "half_body", "selfie"], help="override detected shot type"
    )
    parser.add_argument("--source", help="where the pose came from, e.g. a Pinterest URL")
    parser.add_argument("--out", type=Path, default=TEMPLATES_DIR)
    parser.add_argument("--force", action="store_true", help="overwrite existing templates")
    args = parser.parse_args()

    images = collect_images(args.inputs)
    if not images:
        raise SystemExit("no images found")
    if args.name and len(images) > 1:
        raise SystemExit("--name only works with a single image")

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(ensure_model())),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
    )

    written = 0
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        for path in images:
            bgr = cv2.imread(str(path))
            if bgr is None:
                print(f"skip {path.name}: could not read image")
                continue
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not result.pose_landmarks:
                print(f"skip {path.name}: no person detected")
                continue

            height, width = bgr.shape[:2]
            points = keypoints_from_landmarks(result.pose_landmarks[0], width, height)
            try:
                frame, keypoints = normalize(points)
            except ValueError as err:
                print(f"skip {path.name}: {err}")
                continue

            name = args.name or path.stem.replace("_", " ").replace("-", " ").strip().capitalize()
            template = PoseTemplate(
                id=slugify(args.name or path.stem),
                name=name,
                shot=args.shot or infer_shot(points),
                tags=tags,
                frame=frame,
                keypoints=keypoints,
                source=Source(kind="photo", ref=args.source or path.name),
            )
            target = args.out / f"{template.id}.json"
            if target.exists() and not args.force:
                print(f"skip {path.name}: {target.name} exists (use --force)")
                continue

            template.save(args.out)
            write_debug_image(bgr, points, Path("out/extract") / f"{template.id}.png")
            written += 1
            print(f"ok   {path.name} -> {target.name} ({template.shot}, {len(keypoints)} points)")

    print(f"{written}/{len(images)} templates written")


if __name__ == "__main__":
    main()
