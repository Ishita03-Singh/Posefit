# PoseFit

Camera app that detects a person, learns their body shape, and overlays a pose "ghost" in their own shape for them to fit into, then coaches them into it and takes the photo hands-free. Built web-first (works in any phone browser), privacy-first (video never leaves the device), and as a learning project across computer vision, embeddings, RAG and agents.

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | Repo, tooling (Vite, uv, FastAPI) | ✅ Done |
| 1 | Live pose detection with skeleton overlay | ✅ Done |
| 2 | Pose template format, Python authoring tool, 12 starter poses | ✅ Done |
| 3 | Ghost overlay, match score, coaching, voice, auto-capture, ring light | ✅ Done |
| 3+ | Ghost follows you, filled body silhouette, **body scan** (ghost in your own shape) | ✅ Done |
| 3b | Phone level/angle, composition tips, **friend mode** (photographer directions) | ✅ Done |
| 4 | **Add a pose from your photo** (on device), **"Poses for you"** recommendations | ✅ Done |
| 5a | **Best Shots**: rank each burst (pose, eyes open, smile, sharpness, framing, exposure) | ✅ Done |
| 5b | **Semantic pose search** (text + "poses like this photo"), pgvector catalogue | 🟡 Code done; pgvector run pending (needs Docker Desktop running) |
| 6 | RAG photography coach | ⬜ Planned |
| 7 | Vision LLM scene understanding | ⬜ Planned |
| 8 | Photoshoot director agent | ⬜ Planned |
| 9 | Evaluation, tuning, PWA packaging | ⬜ Planned |

Tests: app 69 (Vitest), server 11 (pytest), tools 13 (pytest).

## Getting started

```sh
# 1. Camera app: https://localhost:5173 (and https://<your-LAN-IP>:5173 from a phone on the same Wi-Fi)
cd app && npm install && npm run dev

# 2. Search database (pgvector in Docker; start Docker Desktop first).
#    Credentials live in a git-ignored .env: copy the example and set a password.
cp .env.example .env
docker compose up -d db

# 3. API: http://localhost:8000, proxied by the app at /api
cd server && uv sync
uv run python -m app.search.ingest          # embed the pose library into pgvector (once / after changes)
uv run uvicorn app.main:app --reload --port 8000

# 4. Template tools (adding poses from photos on the computer)
cd tools && uv sync
```

The dev server uses a self-signed certificate so the camera works on phones: accept the browser warning once. Steps 2–3 are optional: without them the app still works fully on device, and search falls back to on-device matching.

Run the tests:

```sh
cd app && npm test            # + npm run lint, npm run build
cd server && uv run pytest    # pgvector test runs only when the database is up
cd tools && uv run pytest
```

## What's done

### Camera and coaching (phases 1–3b)
- **Live pose tracking** with MediaPipe (33 body points, GPU with CPU fallback, lite/accurate models), self-hosted models, no CDN.
- **Ghost overlay**: a soft, filled, curved body silhouette that sits on *your* torso and scales as you move. With a **body scan** (A-pose, ~2 s) it takes your measured shape: shoulders, chest, waist, hips, limb thickness and lengths. Stored as ~30 numbers on the device; no image is kept.
- **Matching**: limb-angle scoring (independent of body size), weighted to each pose's key joints. Limbs turn green / amber / red; the whole ghost turns green when you match.
- **Coaching**: one instruction at a time, from your own point of view ("Raise your left hand", "Step back"), spoken aloud. Framing first, then phone tilt, then pose, then soft photo tips.
- **Phone angle** (motion sensor): level indicator, "pointing down shortens legs", low-angle selfie warning. **Composition**: headroom, knee crops, feet near the bottom, selfie eye line.
- **Friend mode** (rear camera): the screen talks to the photographer ("Turn the phone a little to the right", "Ask them to raise their left hand"); only the subject's instructions are spoken.
- **Auto-capture**: hold ~0.7 s → spoken 3-2-1 → burst of 5 → stops (no runaway shooting). Tap to pause. Manual shutter, ring light for selfies, "Other side" to mirror a pose.

### Poses (phases 2, 4)
- **12 starter poses** (full body, half body, selfie) generated from joint angles; template format with JSON Schema in `shared/`.
- **Add a pose from a photo**, e.g. a Pinterest screenshot, in the app (on device) or with the Python tool (`tools/`). Key joints are picked automatically. Only the pose is saved, never the photo.
- **"Poses for you"**: neutral observations from your body scan (e.g. "Your legs are a little shorter than average for your torso"; never height, weight or body-type labels) and ranked suggestions with reasons ("Crossed legs make legs look longer").

### Photos (phase 5a)
- **Best Shots**: each burst is ranked; the best is badged with notes (Great pose, Sharpest, Smiling, Eyes closed, Blurry, Too dark…). "Keep only the best". Save / Share.

### Search (phase 5b)
- **Text search** ("candid at a café", "sitting on stairs") with open-source MiniLM embeddings (fastembed / ONNX, 87 MB, ~1.5 ms per query on CPU, no GPU or PyTorch). Understands meaning, not just words ("coffee shop" finds the *cafe* pose).
- **"Find poses like a photo"**: the pose is extracted on the phone and compared as a 20-number limb-direction vector; only those numbers are sent, never the photo.
- **Catalogue in pgvector** (HNSW indexes) on the server; **offline-first** on the phone (on-device pose-vector search and keyword fallback). Personal poses are always searched on device.

## What's left

**Next up**
- [ ] 5b: start Docker Desktop, run `docker compose up -d db`, ingest, and run the pgvector test (code and tests are in place; only the database run is pending).
- [ ] 6 RAG coach: photography/posing knowledge base, retrieval, grounded tips.
- [ ] 7 Vision LLM: opt-in single frame for scene-aware suggestions ("too much sky", beach/café/stairs poses).
- [ ] 8 Photoshoot agent: tool calling (search poses, body profile, lighting check), plans a shoot, reviews shots.
- [ ] 9 Evals and polish: installable PWA, performance on low-end phones, accessibility.

**Known limitations / tuning**
- Thresholds (match tolerance, body-trait cut-offs, blur threshold) are first guesses; tune with real users.
- Templates are 2D: side-on and seated poses are approximate. Photo-based poses look more natural.
- Phone-sensor directions are unverified on some devices (some report gravity inverted; handled but untested on iOS).
- Search isn't in the camera picker yet (library only); catalogue-only results can't be saved as personal poses yet.
- Pose library is small (12 + yours); grows with photo imports and the ingest pipeline.

## How to test each phase

Open https://localhost:5173 (or the LAN URL on your phone). Use **Chrome** on Android or desktop; on iOS, Safari asks for motion permission when you tap *Start camera*.

| Phase | Steps | Expected |
|---|---|---|
| 1 Tracking | Start camera, stand in view, toggle **Skeleton** | Skeleton follows you; HUD shows fps, GPU/CPU |
| 2 Library | Home → **Pose library** | 12 poses with figures, filters by shot type |
| 3+ Body scan | First camera start (or **Scan body**): stand straight, arms slightly out, whole body in view | Progress bar fills, "Body scan done"; ghost now has your shape |
| 3 Ghost + coaching | Pick a pose (bottom: *Pose: … · Change*), step back | Ghost sits on you and scales as you move; one spoken instruction at a time |
| 3 Auto-capture | Match the pose until the ghost turns green, hold | "Hold it" → 3-2-1 → 5 shots → review opens; tap screen pauses Auto |
| 3 Extras | **Other side**, **Ring light** (selfie camera), manual shutter | Mirrored pose; white frame lights your face; photo in tray |
| 3b Phone angle | On a phone: tilt it sideways; point the rear camera down at a full-body pose | Level line stays parallel to the real horizon, turns green when level; "Lower the phone…" tip |
| 3b Friend mode | **Flip** to the rear camera; someone else holds the phone | Screen: "Turn the phone…", "Ask them to…"; phone speaks only the subject's instructions |
| 4 Photo pose | Library → **+ Add pose from photo** (or camera **+ Photo**) → pick a photo of one person | Figure appears; save → shows in *Your poses* and is selectable in the camera |
| 4 For you | Do a body scan, then open the library | *For you* shows observations + 4 poses with reasons; camera picker shows *For you* badges |
| 5a Best Shots | Let auto-capture take a burst; blink on purpose in one frame | Review groups the burst; *Best shot* badge on an eyes-open, sharp frame; notes; **Keep only the best** |
| 5b Search offline | Library → search "sitting on steps" (no server running) | Results with % match + "Offline: searched the poses on this device" |
| 5b Search online | Start db + ingest + API (Getting started 2–3), search "relaxed photo at a coffee shop" | *Chin on hand* (tagged café) near the top, no offline note |
| 5b Photo search | **Find poses like a photo** → pick a photo | Poses with a similar shape, highest % first |

Please report anything that feels off (a hint pointing the wrong way, capture firing too easily or never, the ghost misplaced); most behaviour is driven by tunable thresholds.

## Privacy

- Camera video is processed on the device and never uploaded.
- Body scan and your poses are stored only in this browser (localStorage) as numbers, never images.
- Credentials (database password, later API keys) live only in the git-ignored `.env`; `.env.example` documents the variables.
- Photo search sends only a 20-number pose vector (and text searches send the query text) to the server.
- Later AI phases (vision LLM) will send a frame only with explicit, per-use opt-in.

## Repo layout

| Path | What | Stack |
|---|---|---|
| `app/` | Camera web app: tracking, ghost, coaching, capture, Best Shots, library, search client | React, TypeScript, Vite, MediaPipe Tasks Vision, Vitest |
| `server/` | API: semantic pose search (later RAG, agent) | Python 3.12, FastAPI, fastembed (MiniLM), pgvector, uv |
| `tools/` | Template authoring from photos, starter poses, previews | Python, MediaPipe, OpenCV |
| `shared/` | Pose templates (JSON) + JSON Schema: the contract between app, server and tools | JSON |
| `docs/` | Architecture and decisions | Markdown |
| `docker-compose.yml` | Local Postgres + pgvector | Docker |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design (fast on-device loop vs slow AI loop) and key decisions.
