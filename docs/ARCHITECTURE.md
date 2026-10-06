# Architecture

## Two loops

```
FAST LOOP (on device, every frame)          SLOW LOOP (server, on demand)
camera ─► pose / face / segmentation        one frame (opt-in) ─► vision LLM
       ─► body analysis                                      ─► agent
       ─► template fit ─► overlay                            ─► RAG + semantic search
       ─► match score ─► guidance ─► auto-capture            ─► pose plan back to app
```

The fast loop must run at ~30 fps, so it is pure on-device computer vision. LLM calls take seconds and are only used for planning and suggestions.

## Decisions

1. **Web first.** Prototype as a React web app (PWA) using MediaPipe Tasks Vision (WASM/WebGPU). Fastest to iterate on Windows and testable on any phone. Port to Flutter or React Native once the core is proven.
2. **No absolute height or weight from the camera.** A single camera cannot recover scale. We measure proportions (shoulder/hip ratio, leg/torso ratio, shot type). Height is an optional user input.
3. **Templates are data, not images.** Normalized keypoints plus tags, so they can be scaled and aligned to any body.
4. **Privacy by default.** Video never leaves the device. Sending a frame to the server is an explicit, per-use opt-in. Reference photos for template authoring are git-ignored.
5. **Provider-agnostic LLM layer.** A small interface over Claude / OpenAI so models can be swapped and compared.
6. **Python for AI and tooling, TypeScript for the client.**
