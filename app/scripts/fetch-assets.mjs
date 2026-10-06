// Copies MediaPipe WASM from node_modules and downloads pose models into public/,
// so the app serves them itself (no CDN at runtime). Runs before dev/build; skips existing files.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public', 'mediapipe')

const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmDest = join(publicDir, 'wasm')
cpSync(wasmSrc, wasmDest, { recursive: true })
console.log('[assets] wasm copied')

const MODELS = {
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
}

const modelDir = join(publicDir, 'models')
mkdirSync(modelDir, { recursive: true })

for (const [file, url] of Object.entries(MODELS)) {
  const dest = join(modelDir, file)
  if (existsSync(dest)) continue
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[assets] ${file}: HTTP ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`[assets] downloaded ${file}`)
}
