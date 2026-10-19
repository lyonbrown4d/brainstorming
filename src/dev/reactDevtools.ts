import { initialize, connectToDevTools } from 'react-devtools-core'

// The official standalone backend must install its hook before React and React Scan.
// Opt in locally: start `pnpm devtools`, then VITE_REACT_DEVTOOLS=true pnpm dev.
initialize()
connectToDevTools({
  host: '127.0.0.1',
  port: 8097,
  retryConnectionDelay: 3000,
  isAppActive: () => document.visibilityState === 'visible',
})
