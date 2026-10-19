import { useEffect, useRef } from 'react'
import { useTopicPropertyFocus } from '@renderer/state/topicShortcutActions'
import { useEditor } from '@renderer/state/editor'

/** Focus after the existing Accordion and inspector have revealed the requested field. */
export const useTopicPropertyFocusTarget = (topicId: string, section: 'notes' | 'link') => {
  const ref = useRef<HTMLElement>(null)
  const request = useTopicPropertyFocus((state) => state.request)
  useEffect(() => {
    const editor = useEditor.getState()
    if (
      request?.topicId !== topicId ||
      request.section !== section ||
      request.documentId !== editor.history.document.id ||
      request.sheetId !== editor.activeSheetId
    )
      return
    const frame = requestAnimationFrame(() => {
      const input =
        ref.current?.querySelector<HTMLElement>('input, [contenteditable="true"]') ??
        ref.current?.querySelector<HTMLElement>('[role="combobox"]')
      if (input) {
        input.focus({ preventScroll: true })
        input.scrollIntoView({ block: 'nearest' })
        if (useTopicPropertyFocus.getState().request === request)
          useTopicPropertyFocus.setState({ request: null })
      }
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [request, section, topicId])
  return ref
}
