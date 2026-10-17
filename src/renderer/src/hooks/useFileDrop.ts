import { useRef, useState, type DragEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AUDIO_MIME_TYPES, type Command, type DocumentAsset } from '@core'
import { imageDimensions } from '@assets'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { useEditor } from '@renderer/state/editor'
import { acceptOpenedDocument } from '@renderer/state/files'
import { usePresentation } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'
import { translate } from '@renderer/i18n'

interface DropTarget {
  workbookId: string
  sheetId: string
  topicId: string
}

/** One drop commits one command, including all resources; a changed target stays untouched. */
export const attachDroppedAssets = (
  assets: readonly DocumentAsset[],
  target: DropTarget | null,
): void => {
  if (assets.length === 0) return
  if (!target) throw new Error(translate('dropNeedsDocument'))
  const state = useEditor.getState()
  if (
    state.workbook.id !== target.workbookId ||
    state.activeSheetId !== target.sheetId ||
    !state.history.document.topics[target.topicId]
  )
    throw new Error(translate('droppedTargetChanged'))
  const commands: Command[] = []
  let imageAdded = false
  let audioAdded = false
  for (const asset of assets) {
    if (
      !imageAdded &&
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff', 'image/avif'].includes(
        asset.mimeType,
      )
    ) {
      commands.push({
        type: 'setTopicImage',
        topicId: target.topicId,
        asset,
        ...imageDimensions(asset),
      })
      imageAdded = true
    } else if (!audioAdded && AUDIO_MIME_TYPES.some((type) => type === asset.mimeType)) {
      commands.push({ type: 'setTopicAudio', topicId: target.topicId, asset })
      audioAdded = true
    } else commands.push({ type: 'addTopicAttachment', topicId: target.topicId, asset })
  }
  if (!state.command({ type: 'batch', commands }))
    throw new Error(useEditor.getState().error ?? translate('droppedFilesFailed'))
}

export const importDroppedFiles = async (
  files: readonly File[],
  target: DropTarget | null,
): Promise<void> => {
  const state = useEditor.getState()
  if (state.busy || usePresentation.getState().playing) return
  state.commitDraft()
  if (useEditor.getState().editingId) return
  useEditor.setState({ busy: true, error: null })
  let result
  try {
    result = await requireDesktopAPI().importDroppedFiles(files)
    if (target || result.documents.length === 0) attachDroppedAssets(result.assets, target)
  } finally {
    useEditor.setState({ busy: false })
  }
  // Sequential activation preserves document ordering and the existing password workflow.
  for (const document of result.documents) await acceptOpenedDocument(document)
  if (!target && result.documents.length > 0 && result.assets.length > 0) {
    const current = useEditor.getState()
    const openedTarget = useWorkspace.getState().hasDocument
      ? {
          workbookId: current.workbook.id,
          sheetId: current.activeSheetId,
          topicId: current.selectedId,
        }
      : null
    attachDroppedAssets(result.assets, openedTarget)
  }
}

const hasFiles = (event: DragEvent<HTMLDivElement>): boolean =>
  event.dataTransfer.types.includes('Files')

export const useFileDrop = () => {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const active = useRef(false)
  const mutation = useMutation(
    {
      mutationFn: ({ files, target }: { files: readonly File[]; target: DropTarget | null }) =>
        importDroppedFiles(files, target),
    },
    queryClient,
  )
  const resetDrag = (): void => {
    depth.current = 0
    setDragging(false)
  }
  return {
    dragging,
    loading: mutation.isPending,
    error: mutation.error ? mutation.error.message || translate('droppedFilesFailed') : null,
    dismissError: () => {
      mutation.reset()
    },
    handlers: {
      onDragEnterCapture: (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current += 1
        setDragging(true)
      },
      onDragLeaveCapture: (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDragOverCapture: (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect =
          active.current || useEditor.getState().busy ? 'none' : 'copy'
      },
      onDropCapture: (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        resetDrag()
        const files = Array.from(event.dataTransfer.files)
        if (!files.length || active.current || useEditor.getState().busy) return
        const state = useEditor.getState()
        const element =
          event.target instanceof Element
            ? event.target.closest('[data-topic-id], .react-flow__node[data-id]')
            : null
        const topicId =
          element?.getAttribute('data-topic-id') ??
          element?.getAttribute('data-id') ??
          state.selectedId
        const target =
          useWorkspace.getState().screen === 'editor'
            ? { workbookId: state.workbook.id, sheetId: state.activeSheetId, topicId }
            : null
        active.current = true
        mutation.mutate(
          { files, target },
          {
            onSettled: () => {
              active.current = false
            },
          },
        )
      },
    },
  }
}
