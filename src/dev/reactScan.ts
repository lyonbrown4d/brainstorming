import { scan } from 'react-scan'

// Import before React. Use the supported fallback without relaxing native CSP.
scan({
  enabled: true,
  showToolbar: true,
  showFPS: true,
  useOffscreenCanvasWorker: false,
})
