import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { createWorkspaceRouteBridge } from '@renderer/routing/workspaceBridge'

/** Synchronize URL navigation with the existing document/session commands. */
export const useWorkspaceRoutes = (): void => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const bridge = createWorkspaceRouteBridge((path, options) => {
      void navigate(path, options)
    })
    bridge.applyLocation(pathname)
    return bridge.dispose
  }, [navigate, pathname])
}
