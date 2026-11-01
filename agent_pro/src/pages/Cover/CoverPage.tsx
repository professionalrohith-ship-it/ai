import { useEffect, useState } from 'react'
import coverImg from '../../assets/images/cover.svg'
import GlassButton from './GlassButton.jsx'
import './CoverPage.css'

// Light sources found in the artwork. Each one is a glow layer positioned in percent of the
// (stretched) image, so it stays on the painted source at every window size.
const LIGHTS = [
  'lamp-bloom',
  'lamp-spill',
  'book-spill',
  'ceiling-bloom',
  'ceiling-cone',
  'ceiling-tube',
  'ceiling-core',
  'sun-bloom',
  'sun-haze',
  'window-rim',
  'castle-a',
  'castle-b',
  'castle-c',
  'castle-d',
  'castle-e',
  'lantern-a',
  'lantern-b',
  'poster-sun',
  'pumpkin-bloom',
  'pumpkin-spill',
  'pumpkin-core',
  'pumpkin-table',
  'monitor-glow',
  'screen-shade',
  'screen-face-dino',
  'screen-face-dino-fill',
  'screen-face-cat',
  'screen-body',
  'screen-rim',
  'screen-rim-bloom',
  'logo-halo',
  'logo-core',
]

interface CoverPageProps {
  onGetStarted?: () => void
}

function CoverPage({ onGetStarted }: CoverPageProps) {
  const [ready, setReady] = useState(false)

  // Only add the glows once the artwork is painted, so they never float over an empty screen.
  useEffect(() => {
    const img = new Image()
    img.onload = () => setReady(true)
    img.src = coverImg
    return () => {
      img.onload = null
    }
  }, [])

  return (
    <main className="cover">
      <div
        className="cover-art"
        role="img"
        aria-label="Codemind AI: a baby dinosaur in a pumpkin hat and a purple cat in a hoodie coding together on a laptop at dusk"
        style={{ backgroundImage: `url(${coverImg})` }}
      />
      {ready && (
        <div className="cover-lights" aria-hidden="true">
          <span className="logo-beam" />
          {LIGHTS.map((name) => (
            <span key={name} className={`light ${name}`} />
          ))}
        </div>
      )}
      <GlassButton onClick={onGetStarted}>Get Started</GlassButton>
    </main>
  )
}

export default CoverPage
