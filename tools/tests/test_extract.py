from dataclasses import dataclass

from posefit_tools.extract import LANDMARK_INDEX, keypoints_from_landmarks, slugify
from posefit_tools.template import TEMPLATE_KEYPOINTS


@dataclass
class FakeLandmark:
    x: float
    y: float
    visibility: float | None = 0.9


def test_landmark_index_covers_all_template_keypoints() -> None:
    assert set(LANDMARK_INDEX) == set(TEMPLATE_KEYPOINTS)
    assert LANDMARK_INDEX["nose"] == 0
    assert LANDMARK_INDEX["left_shoulder"] == 11


def test_keypoints_are_converted_to_pixels_and_filtered() -> None:
    landmarks = [FakeLandmark(0.5, 0.5) for _ in range(33)]
    landmarks[LANDMARK_INDEX["left_shoulder"]] = FakeLandmark(0.25, 0.5)
    landmarks[LANDMARK_INDEX["left_wrist"]] = FakeLandmark(0.5, 0.5, visibility=0.1)
    landmarks[LANDMARK_INDEX["left_ankle"]] = FakeLandmark(0.5, 1.4)

    points = keypoints_from_landmarks(landmarks, width=400, height=800)

    assert points["left_shoulder"] == (100.0, 400.0)
    assert "left_wrist" not in points  # low visibility
    assert "left_ankle" not in points  # out of frame


def test_slugify() -> None:
    assert slugify("Café Lean (2)") == "caf-lean-2"
    assert slugify("!!!") == "pose"
