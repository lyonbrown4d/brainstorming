import { useEffect, type ReactNode } from 'react'
import { synchronizeDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'
import { MemoryRouter, Route, Routes, useInRouterContext } from 'react-router'
import { canonicalWorkspacePath, workspaceRouteDefinitions } from '@renderer/routing/workspacePaths'
import { useWorkspaceRoutes } from '@renderer/hooks/useWorkspaceRoutes'

/** Isolated stories get memory history; the native entry supplies HashRouter. */
const StoryWorkspaceRouter = ({ children }: { children: ReactNode }) => {
  const hasDocument = useWorkspace((state) => state.hasDocument)
  const activeId = useDocumentTabs((state) => state.activeId)
  useEffect(() => {
    if (hasDocument && !activeId) synchronizeDocumentTab()
  }, [activeId, hasDocument])
  if (hasDocument && !activeId) return null
  return <MemoryRouter initialEntries={[canonicalWorkspacePath()]}>{children}</MemoryRouter>
}

export const WorkspaceRouterBoundary = ({ children }: { children: ReactNode }) => {
  const withinRouter = useInRouterContext()
  return withinRouter ? children : <StoryWorkspaceRouter>{children}</StoryWorkspaceRouter>
}

export const WorkspaceRoutes = ({ children }: { children: ReactNode }) => {
  useWorkspaceRoutes()
  return (
    <Routes>
      {workspaceRouteDefinitions.map((route) => (
        <Route key={route.id} path={route.path} element={children} />
      ))}
      <Route path="*" element={children} />
    </Routes>
  )
}
