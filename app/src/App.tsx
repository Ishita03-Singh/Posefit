import { useState } from 'react'

import { CameraView } from './components/CameraView'

function App() {
  const [started, setStarted] = useState(false)

  if (started) return <CameraView onExit={() => setStarted(false)} />

  return (
    <main className="shell">
      <h1>PoseFit</h1>
      <p>Pose guidance for better photos and selfies.</p>
      <p className="note">Video is processed on your device and never uploaded.</p>
      <button type="button" className="primary" onClick={() => setStarted(true)}>
        Start camera
      </button>
    </main>
  )
}

export default App
