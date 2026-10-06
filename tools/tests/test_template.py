import math

import pytest
from pydantic import ValidationError

from posefit_tools.template import HEAD_TO_TORSO, PoseTemplate, Source, infer_shot, normalize


def test_normalize_torso_frame_puts_mid_hip_at_origin_and_torso_at_unit_length() -> None:
    points = {
        "left_shoulder": (140.0, 100.0),
        "right_shoulder": (60.0, 100.0),
        "left_hip": (120.0, 300.0),
        "right_hip": (80.0, 300.0),
    }
    frame, kp = normalize(points)
    assert frame == "torso"
    mid_hip = ((kp["left_hip"][0] + kp["right_hip"][0]) / 2, kp["left_hip"][1])
    assert mid_hip == pytest.approx((0.0, 0.0))
    assert kp["left_shoulder"] == pytest.approx((0.2, -1.0))


def test_normalize_head_frame_used_without_hips() -> None:
    points = {
        "nose": (100.0, 55.0),
        "left_shoulder": (150.0, 100.0),
        "right_shoulder": (50.0, 100.0),
    }
    frame, kp = normalize(points)
    assert frame == "head"
    assert math.dist(kp["nose"], (0.0, 0.0)) == pytest.approx(HEAD_TO_TORSO)


def test_normalize_requires_shoulders() -> None:
    with pytest.raises(ValueError):
        normalize({"nose": (0.0, 0.0)})


def test_infer_shot() -> None:
    upper = {"nose": (0, 0), "left_shoulder": (1, 1), "right_shoulder": (-1, 1)}
    assert infer_shot(upper) == "selfie"
    assert infer_shot(upper | {"left_hip": (0, 3)}) == "half_body"
    assert infer_shot(upper | {"left_knee": (0, 5), "left_ankle": (0, 7)}) == "full_body"


def _template(**overrides) -> PoseTemplate:
    data = {
        "id": "test-pose",
        "name": "Test",
        "shot": "selfie",
        "frame": "head",
        "keypoints": {"left_shoulder": (0.4, 0.0), "right_shoulder": (-0.4, 0.0)},
        "source": Source(kind="generated"),
    }
    return PoseTemplate(**(data | overrides))


def test_template_rejects_bad_id_unknown_points_and_missing_key_joints() -> None:
    with pytest.raises(ValidationError):
        _template(id="Not Kebab")
    with pytest.raises(ValidationError):
        _template(keypoints={"left_shoulder": (0, 0), "right_shoulder": (0, 0), "tail": (0, 0)})
    with pytest.raises(ValidationError):
        _template(key_joints=["nose"])


def test_template_round_trips_through_json(tmp_path) -> None:
    t = _template(key_joints=["left_shoulder"])
    assert PoseTemplate.load(t.save(tmp_path)) == t


def test_committed_json_schema_is_up_to_date() -> None:
    from posefit_tools.template import SCHEMA_PATH, schema_json

    assert SCHEMA_PATH.read_text(encoding="utf-8") == schema_json(), (
        "run: uv run python -m posefit_tools.template"
    )
