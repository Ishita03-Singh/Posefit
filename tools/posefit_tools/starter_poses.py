"""Hand-authored starter pose library, generated from joint angles.

Run:  uv run python -m posefit_tools.starter_poses
Writes one JSON file per pose to shared/templates/. Edit the angles here and re-run;
don't hand-edit the generated JSON.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .skeleton import Limb, Pose, build
from .template import PoseTemplate, Shot, Source, normalize

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "shared" / "templates"

LEGS = ("knee", "ankle", "heel", "foot_index")
LOWER_BODY = tuple(f"{side}_{part}" for side in ("left", "right") for part in LEGS)
HIPS = ("left_hip", "right_hip")


@dataclass
class Spec:
    id: str
    name: str
    description: str
    shot: Shot
    tags: list[str]
    key_joints: list[str]
    pose: Pose
    drop: tuple[str, ...] = field(default_factory=tuple)


SPECS: list[Spec] = [
    Spec(
        id="body-scan",
        name="Body scan",
        description="Neutral A-pose used to measure the person's body shape. Not shown in the library.",
        shot="full_body",
        tags=["system"],
        key_joints=["left_wrist", "right_wrist", "left_ankle", "right_ankle"],
        pose=Pose(
            left_arm=Limb(28, 24),
            right_arm=Limb(28, 24),
            left_leg=Limb(7, 3),
            right_leg=Limb(7, 3),
        ),
    ),
    Spec(
        id="classic-hand-on-hip",
        name="Classic hand on hip",
        description="Weight on one leg, opposite hand on the waist. Creates an S-curve "
        "and space between arm and body, which reads slimmer.",
        shot="full_body",
        tags=["standing", "classic", "slimming", "outfit"],
        key_joints=["left_elbow", "left_wrist", "left_knee", "left_ankle"],
        pose=Pose(
            hip_tilt=-6,
            shoulder_tilt=4,
            head_tilt=6,
            left_arm=Limb(40, -49),
            right_arm=Limb(8, 5),
            left_leg=Limb(-8, 8),
            right_leg=Limb(3, 2),
        ),
    ),
    Spec(
        id="hand-in-hair",
        name="Hand in hair",
        description="One hand running through the hair, elbow up and out. Lengthens the "
        "body line and frames the face.",
        shot="full_body",
        tags=["standing", "glam", "elongating"],
        key_joints=["left_elbow", "left_wrist", "right_knee"],
        pose=Pose(
            hip_tilt=5,
            shoulder_tilt=-3,
            head_tilt=-8,
            left_arm=Limb(150, -95),
            right_arm=Limb(10, 5),
            left_leg=Limb(2, 1),
            right_leg=Limb(-6, 6),
        ),
    ),
    Spec(
        id="crossed-ankles",
        name="Crossed ankles",
        description="Standing with ankles crossed and hands loosely together in front. "
        "Soft, relaxed and elongates the legs.",
        shot="full_body",
        tags=["standing", "soft", "elongating", "outfit"],
        key_joints=["left_ankle", "right_ankle", "left_wrist", "right_wrist"],
        pose=Pose(
            head_tilt=5,
            left_arm=Limb(12, -50),
            right_arm=Limb(12, -50),
            left_leg=Limb(-5, -18),
            right_leg=Limb(0, -8),
        ),
    ),
    Spec(
        id="walking-candid",
        name="Candid walk",
        description="Mid-stride, slightly turned, looking away from the camera. Ask the "
        "photographer to shoot in burst mode while you walk.",
        shot="full_body",
        tags=["walking", "candid", "street", "outfit"],
        key_joints=["left_knee", "right_knee", "left_wrist", "right_wrist", "nose"],
        pose=Pose(
            turn=25,
            head_turn=0.6,
            left_arm=Limb(6, 4, 0.95, 0.9),
            right_arm=Limb(-8, -22, 0.85, 0.8),
            left_leg=Limb(4, -2, 0.85, 1.0),
            right_leg=Limb(3, 10, 1.0, 0.9),
        ),
    ),
    Spec(
        id="hands-in-pockets",
        name="Hands in pockets, turned",
        description="Body turned about 35 degrees, hands in pockets, looking back at the "
        "camera. A turned body looks narrower than a square-on one.",
        shot="full_body",
        tags=["standing", "casual", "slimming", "street"],
        key_joints=["left_wrist", "right_wrist", "left_shoulder", "right_shoulder"],
        pose=Pose(
            turn=35,
            head_turn=-0.5,
            head_tilt=5,
            left_arm=Limb(15, -15),
            right_arm=Limb(15, -15),
            left_leg=Limb(-4, 2),
            right_leg=Limb(3, 0),
        ),
    ),
    Spec(
        id="victory-arms-up",
        name="Arms up",
        description="Both arms raised in a V, chin up. Energetic, works great on beaches "
        "and viewpoints.",
        shot="full_body",
        tags=["standing", "energetic", "travel", "beach"],
        key_joints=["left_wrist", "right_wrist", "left_elbow", "right_elbow"],
        pose=Pose(
            head_drop=-0.3,
            left_arm=Limb(150, 160),
            right_arm=Limb(150, 160),
            left_leg=Limb(10, 8),
            right_leg=Limb(10, 8),
        ),
    ),
    Spec(
        id="seated-steps",
        name="Sitting on steps",
        description="Seated facing the camera, knees up, forearms resting loosely between "
        "the knees. Shoot from slightly below eye level.",
        shot="full_body",
        tags=["sitting", "casual", "street"],
        key_joints=["left_knee", "right_knee", "left_wrist", "right_wrist"],
        pose=Pose(
            head_tilt=6,
            left_arm=Limb(10, -20),
            right_arm=Limb(10, -20),
            left_leg=Limb(15, 3, 0.35, 1.0),
            right_leg=Limb(15, 3, 0.35, 1.0),
        ),
    ),
    Spec(
        id="arms-crossed",
        name="Arms crossed",
        description="Confident half-body shot with arms crossed and a slight head tilt.",
        shot="half_body",
        tags=["confident", "professional", "portrait"],
        key_joints=["left_wrist", "right_wrist", "left_elbow", "right_elbow"],
        pose=Pose(
            head_tilt=-4,
            left_arm=Limb(-2, -100, 0.8, 1.0),
            right_arm=Limb(-2, -80, 0.8, 1.0),
        ),
        drop=LOWER_BODY,
    ),
    Spec(
        id="chin-rest",
        name="Chin on hand",
        description="Hand resting lightly under the chin, head tilted toward it. Keep the "
        "touch light so the face isn't pushed.",
        shot="half_body",
        tags=["portrait", "soft", "cafe"],
        key_joints=["left_wrist", "left_elbow", "nose"],
        pose=Pose(
            head_tilt=10,
            head_drop=0.2,
            left_arm=Limb(-25, -162, 0.6, 1.0),
            right_arm=Limb(8, 4),
        ),
        drop=LOWER_BODY,
    ),
    Spec(
        id="over-shoulder",
        name="Look over the shoulder",
        description="Back mostly to the camera, head turned to look over the shoulder.",
        shot="half_body",
        tags=["portrait", "glam", "travel"],
        key_joints=["nose", "left_ear", "right_ear", "left_shoulder", "right_shoulder"],
        pose=Pose(
            turn=65,
            head_turn=-0.8,
            head_tilt=-5,
            left_arm=Limb(5, 5),
            right_arm=Limb(5, 5),
        ),
        drop=LOWER_BODY,
    ),
    Spec(
        id="selfie-peace",
        name="Peace sign selfie",
        description="Phone held out with one arm, free hand making a peace sign by the "
        "cheek, head tilted.",
        shot="selfie",
        tags=["selfie", "playful"],
        key_joints=["left_wrist", "nose", "left_eye", "right_eye"],
        pose=Pose(
            head_tilt=10,
            left_arm=Limb(-10, -173, 0.45, 1.0),
        ),
        drop=LOWER_BODY + HIPS + ("right_elbow", "right_wrist"),
    ),
    Spec(
        id="selfie-high-angle",
        name="High angle selfie",
        description="Phone held slightly above eye level, chin forward and down a little. "
        "Flattering for the jawline.",
        shot="selfie",
        tags=["selfie", "flattering", "jawline"],
        key_joints=["nose", "left_eye", "right_eye", "left_shoulder", "right_shoulder"],
        pose=Pose(
            head_drop=0.5,
            head_tilt=-8,
        ),
        drop=LOWER_BODY + HIPS + ("left_elbow", "left_wrist", "right_elbow", "right_wrist"),
    ),
]


def make_template(spec: Spec) -> PoseTemplate:
    points = {name: p for name, p in build(spec.pose).items() if name not in spec.drop}
    frame, keypoints = normalize(points)
    return PoseTemplate(
        id=spec.id,
        name=spec.name,
        description=spec.description,
        shot=spec.shot,
        tags=spec.tags,
        frame=frame,
        keypoints=keypoints,
        key_joints=spec.key_joints,
        source=Source(kind="generated"),
    )


def main() -> None:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        path = make_template(spec).save(TEMPLATES_DIR)
        print(f"wrote {path.relative_to(TEMPLATES_DIR.parents[1])}")


if __name__ == "__main__":
    main()
