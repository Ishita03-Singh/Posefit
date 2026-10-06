import { useState } from 'react'

import { CameraView } from './components/CameraView'
import { PoseLibrary } from './components/PoseLibrary'

type Screen = 'home' | 'camera' | 'library'

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const home = () => setScreen('home')

  if (screen === 'camera') return <CameraView onExit={home} />
  if (screen === 'library') return <PoseLibrary onBack={home} />

  return (
    <main className="shell">
      <h1>PoseFit</h1>
      <p>Pose guidance for better photos and selfies.</p>
      <p className="note">Video is processed on your device and never uploaded.</p>
      <div className="actions">
        <button type="button" className="primary" onClick={() => setScreen('camera')}>
          Start camera
        </button>
        <button type="button" className="secondary" onClick={() => setScreen('library')}>
          Pose library
        </button>
      </div>
    </main>
  )
}

export default App
