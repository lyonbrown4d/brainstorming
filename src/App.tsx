import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { ApplicationShell } from '@renderer/components/application/ApplicationShell'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { queryClient } from '@renderer/lib/queryClient'
import { WorkspaceRouterBoundary, WorkspaceRoutes } from '@renderer/routing/WorkspaceRouter'
import '@xyflow/react/dist/style.css'
import '@renderer/styles/ui.css'
import '@renderer/styles/loading.scss'
import '@renderer/styles/base.scss'
import '@renderer/styles/window.scss'
import '@renderer/styles/topics.scss'
import '@renderer/styles/motion.scss'

export const App = () => (
  <WorkspaceRouterBoundary>
    <WorkspaceRoutes>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <ApplicationShell />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </WorkspaceRoutes>
  </WorkspaceRouterBoundary>
)
