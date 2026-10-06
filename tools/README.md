# PoseFit tools

Offline Python tooling for the pose template library in `../shared/templates/`.

```sh
uv sync
uv run pytest
```

## Adding poses from photos (Pinterest etc.)

1. Save reference photos into `tools/reference_photos/` (git-ignored; photos never leave your machine).
   Best results: one person, whole body in frame for full-body poses, no heavy cropping of limbs.
2. Extract templates:
   ```sh
   uv run python -m posefit_tools.extract reference_photos/
   # or one photo with metadata
   uv run python -m posefit_tools.extract reference_photos/cafe.jpg --name "Cafe lean" --tags sitting,cafe --source https://pin.it/...
   ```
   Shot type (full body / half body / selfie) is detected from which body parts are visible; override with `--shot`.
3. Check the detected points in `out/extract/<id>.png`, then open the JSON in `shared/templates/` and fill in
   `description`, `tags` and `key_joints` (the joints that define the pose, matched more strictly in Phase 3).
4. Review the whole library: `uv run python -m posefit_tools.preview` → `out/preview.png`, or the Pose library screen in the app.

Templates store only normalized keypoint coordinates, never the image.

## Starter poses

Hand-authored from joint angles in `posefit_tools/starter_poses.py`. Edit the angles there and regenerate:

```sh
uv run python -m posefit_tools.starter_poses
```

## Template format

Defined in `posefit_tools/template.py`; JSON Schema in `shared/pose-template.schema.json`
(regenerate with `uv run python -m posefit_tools.template`). Tests fail if generated files drift from the code.
