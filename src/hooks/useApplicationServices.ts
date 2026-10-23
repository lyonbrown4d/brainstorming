import { useEffect } from 'react'
import { useFileLifecycle } from '@renderer/hooks/useFileLifecycle'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { useLinkPreviewQueue } from '@renderer/hooks/useLinkPreviewQueue'
import { useMCPBridge } from '@renderer/hooks/useMCPBridge'
import { useNativeViewport } from '@renderer/hooks/useNativeViewport'
import { useStartupScreen } from '@renderer/hooks/useStartupScreen'
import { startContentIndexSync } from '@renderer/state/contentIndex'

/** Mount native integrations and document subscriptions once for the application shell. */
export const useApplicationServices = () => {
  useEffect(startContentIndexSync, [])
  useNativeViewport()
  useStartupScreen()
  useMCPBridge()
  useFileLifecycle()
  useLinkPreviewQueue()
  useKeyboardShortcuts()
}
