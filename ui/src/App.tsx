import { useEffect, useState } from 'react'

function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallPrompt(false)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowInstallPrompt(false)
    setDeferredPrompt(null)
  }

  return (
    <div>
      {showInstallPrompt && (
        <div
          style={{
            padding: '12px 16px',
            background: '#1976d2',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>Install CO2 Monitor on your device</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowInstallPrompt(false)}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid white',
                color: 'white',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleInstallClick}
              style={{
                padding: '6px 12px',
                background: 'white',
                color: '#1976d2',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Install
            </button>
          </div>
        </div>
      )}
      <h1>Temperature</h1>
      <p>20°C</p>
      <h1>Humidity</h1>
      <p>40%</p>
      <h1>CO2</h1>
      <p>1000ppm</p>
      <h1>Age</h1>
      <p>1000ms</p>
    </div>
  )
}

export default App
