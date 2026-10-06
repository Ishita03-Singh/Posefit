# PoseFit

Camera app that detects a person, understands their body proportions and the scene, and overlays a pose template they can fit into, so anyone can take aesthetic photos and selfies.

## Repo layout

| Path | What | Stack |
|---|---|---|
| `app/` | Camera web app (fast loop: on-device pose detection, overlay, match, auto-capture) | React, TypeScript, Vite, MediaPipe Tasks Vision |
| `server/` | API for the slow loop: pose library, semantic search, RAG, photoshoot agent | Python 3.12, FastAPI, uv |
| `tools/` | Offline template authoring from reference photos | Python, MediaPipe, OpenCV |
| `shared/templates/` | Pose templates (JSON), shared contract between tools, app and server | JSON |
| `docs/` | Architecture and decisions | Markdown |

## Getting started

```sh
# camera app (https://localhost:5173, also reachable from a phone on the same Wi-Fi)
cd app && npm install && npm run dev

# API (http://localhost:8000, proxied by the app at /api)
cd server && uv sync && uv run uvicorn app.main:app --reload --port 8000

# tools
cd tools && uv sync
```

The dev server uses a self-signed certificate so the camera works on phones; accept the browser warning once.

## Roadmap

| Phase | Goal | You learn |
|---|---|---|
| 0 | Setup, repo, tooling | Monorepo, Vite, uv, FastAPI |
| 1 | Live pose detection with skeleton overlay | MediaPipe, camera APIs, canvas rendering |
| 2 | Pose template format, authoring tool, 20–30 starter poses | Data design, keypoint normalization |
| 3 | Ghost overlay fitted to your proportions, angle-based match score, coaching, voice cues, auto-capture state machine, ring light | Geometry, state machines, real-time loops |
| 3b | Framing, distance and tilt coaching; "friend is shooting" mode | Device sensors, composition rules |
| 4 | Body analysis, rule-based recommendations, in-browser "use your own reference photo" | Feature engineering, baseline recommenders |
| 5 | On-device Best Shots (rank burst photos), then semantic pose search | Image quality metrics, embeddings, CLIP, vector DB (pgvector) |
| 6 | RAG photography coach | Chunking, retrieval, grounded prompting |
| 7 | Vision LLM scene understanding | Multimodal LLMs, provider abstraction |
| 8 | Photoshoot director agent | Tool calling, agent loops, planning |
| 9 | Evaluation and polish | Evals, metrics, PWA packaging |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
