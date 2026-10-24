import { useState } from 'react'
import { useTimeout } from 'ahooks'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useMessages } from '@renderer/i18n/useMessages'

/** Keep readiness observable immediately without interrupting a presented canvas. */
export const CanvasUpdating = () => {
  const { translate } = useMessages()
  const [visible, setVisible] = useState(false)
  useTimeout(() => {
    setVisible(true)
  }, 150)
  return (
    <div
      data-canvas-loading
      data-canvas-updating
      aria-busy="true"
      className="pointer-events-none absolute right-3 bottom-12 z-20"
    >
      {visible && (
        <LoadingState
          label={translate('loading')}
          className="rounded-md border border-border/70 bg-background px-2 py-1 shadow-sm"
        />
      )}
    </div>
  )
}
