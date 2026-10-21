import { useCallback, useEffect, useState } from 'react'

/** Both WebGL surfaces must submit a first frame before 3D editing is unlocked. */
export const useSpatialReadiness = (mode: '2d' | '3d') => {
  const [scene, setScene] = useState(false)
  const [widget, setWidget] = useState(false)
  const onSceneReady = useCallback(() => {
    setScene(true)
  }, [])
  const onWidgetReady = useCallback(() => {
    setWidget(true)
  }, [])
  useEffect(() => {
    if (mode !== '2d') return
    setScene(false)
    setWidget(false)
  }, [mode])
  return { ready: mode === '2d' || (scene && widget), onSceneReady, onWidgetReady }
}
