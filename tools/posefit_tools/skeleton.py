"""2D forward-kinematics stick figure for authoring pose templates by joint angles.

Units are torso lengths, origin is mid-hip, y points down (see template.py).

Limb angle convention (degrees), per side:
    0 = pointing straight down, 90 = pointing straight out to that side,
    180 = straight up, negative = across the body toward the other side.
Using "outward" angles makes left/right specs symmetric: an arm at 30 on both sides is a
symmetric A-pose, whichever side it is on.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .template import HEAD_TO_TORSO, Point

# Average adult proportions, in torso lengths (mid-shoulder to mid-hip).
SHOULDER_WIDTH = 0.78
HIP_WIDTH = 0.42
UPPER_ARM = 0.62
FOREARM = 0.55
THIGH = 0.88
SHIN = 0.82

# Image-x direction of the person's left and right side for a non-mirrored photo.
SIDE_SIGN = {"left": 1.0, "right": -1.0}


@dataclass
class Limb:
    upper: float = 0.0  # angle of upper segment (upper arm / thigh)
    lower: float = 0.0  # angle of lower segment (forearm / shin)
    # <1 shortens a segment to fake foreshortening (limb pointing toward/away from camera).
    upper_scale: float = 1.0
    lower_scale: float = 1.0


@dataclass
class Pose:
    lean: float = 0.0  # torso lean, positive tips the shoulders toward image right
    turn: float = 0.0  # body rotation away from camera, 0..80; narrows shoulders and hips
    shoulder_tilt: float = 0.0  # positive raises the image-right shoulder
    hip_tilt: float = 0.0  # positive raises the image-right hip
    head_tilt: float = 0.0  # positive tilts the head toward image right
    head_turn: float = 0.0  # -1..1, looks toward image left/right
    head_drop: float = 0.0  # positive tucks the chin (head lower, closer to shoulders)
    left_arm: Limb = field(default_factory=Limb)
    right_arm: Limb = field(default_factory=Limb)
    left_leg: Limb = field(default_factory=Limb)
    right_leg: Limb = field(default_factory=Limb)


def _direction(side: str, angle: float) -> Point:
    a = math.radians(angle)
    return (SIDE_SIGN[side] * math.sin(a), math.cos(a))


def _add(p: Point, d: Point, length: float) -> Point:
    return (p[0] + d[0] * length, p[1] + d[1] * length)


def _rotate(p: Point, center: Point, degrees: float) -> Point:
    """Rotates p around center; positive degrees turn the top of a vertical line toward +x."""
    a = math.radians(degrees)
    dx, dy = p[0] - center[0], p[1] - center[1]
    return (
        center[0] + dx * math.cos(a) - dy * math.sin(a),
        center[1] + dx * math.sin(a) + dy * math.cos(a),
    )


def _line_ends(center: Point, width: float, tilt: float) -> tuple[Point, Point]:
    """Returns (left, right) end points of a horizontal segment tilted by `tilt` degrees."""
    a = math.radians(tilt)
    half = (width / 2 * math.cos(a), -width / 2 * math.sin(a))
    return (
        (center[0] + half[0], center[1] + half[1]),
        (center[0] - half[0], center[1] - half[1]),
    )


def build(pose: Pose) -> dict[str, Point]:
    """Computes all template keypoints for a pose."""
    width_factor = math.cos(math.radians(min(max(pose.turn, 0.0), 80.0)))
    pts: dict[str, Point] = {}

    mid_hip: Point = (0.0, 0.0)
    mid_shoulder = _rotate((0.0, -1.0), mid_hip, pose.lean)

    pts["left_hip"], pts["right_hip"] = _line_ends(mid_hip, HIP_WIDTH * width_factor, pose.hip_tilt)
    pts["left_shoulder"], pts["right_shoulder"] = _line_ends(
        mid_shoulder, SHOULDER_WIDTH * width_factor, pose.shoulder_tilt
    )

    # Head: built upright above the shoulders, then tilted around the neck base.
    neck_len = HEAD_TO_TORSO * (1 - 0.35 * pose.head_drop)
    turn = pose.head_turn * 0.12
    nose = (mid_shoulder[0] + turn, mid_shoulder[1] - neck_len)
    head = {
        "nose": nose,
        "left_eye": (nose[0] + 0.065 + turn * 0.3, nose[1] - 0.06),
        "right_eye": (nose[0] - 0.065 + turn * 0.3, nose[1] - 0.06),
        "left_ear": (nose[0] + 0.15 * (1 - max(turn, 0) * 3), nose[1] - 0.03),
        "right_ear": (nose[0] - 0.15 * (1 + min(turn, 0) * 3), nose[1] - 0.03),
    }
    total_tilt = pose.head_tilt + pose.lean
    for name, p in head.items():
        pts[name] = _rotate(p, mid_shoulder, total_tilt)

    for side in ("left", "right"):
        arm: Limb = getattr(pose, f"{side}_arm")
        shoulder = pts[f"{side}_shoulder"]
        elbow = _add(shoulder, _direction(side, arm.upper), UPPER_ARM * arm.upper_scale)
        pts[f"{side}_elbow"] = elbow
        pts[f"{side}_wrist"] = _add(elbow, _direction(side, arm.lower), FOREARM * arm.lower_scale)

        leg: Limb = getattr(pose, f"{side}_leg")
        hip = pts[f"{side}_hip"]
        knee = _add(hip, _direction(side, leg.upper), THIGH * leg.upper_scale)
        pts[f"{side}_knee"] = knee
        ankle = _add(knee, _direction(side, leg.lower), SHIN * leg.lower_scale)
        pts[f"{side}_ankle"] = ankle
        # Front view: the heel sits just under the ankle, toes point slightly out and down.
        pts[f"{side}_heel"] = (ankle[0], ankle[1] + 0.06)
        pts[f"{side}_foot_index"] = (ankle[0] + SIDE_SIGN[side] * 0.05, ankle[1] + 0.11)

    return pts
