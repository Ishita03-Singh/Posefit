import json

from posefit_tools.starter_poses import SPECS, TEMPLATES_DIR, make_template


def test_spec_ids_are_unique() -> None:
    ids = [s.id for s in SPECS]
    assert len(ids) == len(set(ids))


def test_committed_templates_match_specs() -> None:
    """Fails if someone edits SPECS without re-running the generator (or edits the JSON by hand)."""
    for spec in SPECS:
        committed = json.loads((TEMPLATES_DIR / f"{spec.id}.json").read_text(encoding="utf-8"))
        assert committed == json.loads(make_template(spec).model_dump_json()), spec.id


def test_shot_types_match_frames() -> None:
    for spec in SPECS:
        t = make_template(spec)
        assert t.frame == ("head" if t.shot == "selfie" else "torso"), spec.id
