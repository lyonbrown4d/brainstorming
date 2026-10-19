import { useEffect, useState } from 'react'

export const usePresentationTimer = (startedAt: number | null): string => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(interval)
    }
  }, [])
  const seconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
