import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Toolbar,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useBluetooth, type BleStatus } from './useBluetooth'

const statusLabel: Record<BleStatus, string> = {
  idle: 'Idle',
  scanning: 'Scanning',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
}

function App() {
  const { status, errorMessage, data, connect, autoConnect, disconnect } = useBluetooth()
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

  useEffect(() => {
    autoConnect()
  }, [autoConnect])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowInstallPrompt(false)
    setDeferredPrompt(null)
  }

  const isConnecting = status === 'scanning' || status === 'connecting'
  const isConnected = status === 'connected'
  const chipColor =
    status === 'connected'
      ? 'success'
      : status === 'error'
        ? 'error'
        : status === 'scanning' || status === 'connecting'
          ? 'info'
          : 'default'

  const formatValue = (value: number | null, suffix: string): string =>
    value === null ? '—' : `${value}${suffix}`

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" component="h1">
            CO2 Monitor
          </Typography>
          {showInstallPrompt && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">Install on your device</Typography>
              <Button
                size="small"
                variant="outlined"
                sx={{ color: 'white', borderColor: 'white' }}
                onClick={() => setShowInstallPrompt(false)}
              >
                Not now
              </Button>
              <Button
                size="small"
                variant="contained"
                sx={{ bgcolor: 'white', color: 'primary.main' }}
                onClick={handleInstallClick}
              >
                Install
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={statusLabel[status]} color={chipColor} />
          <Button
            variant="contained"
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            startIcon={isConnecting ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </Button>
        </Box>

        {status === 'error' && errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  CO2
                </Typography>
                <Typography variant="h5">{formatValue(data.co2, ' ppm')}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Temperature
                </Typography>
                <Typography variant="h5">
                  {data.temperature === null ? '—' : `${data.temperature.toFixed(1)} °C`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Humidity
                </Typography>
                <Typography variant="h5">
                  {data.humidity === null ? '—' : `${Math.round(data.humidity)} %`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Age
                </Typography>
                <Typography variant="h5">{formatValue(data.age, ' ms')}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}

export default App
