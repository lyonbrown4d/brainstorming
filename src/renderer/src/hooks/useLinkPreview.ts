import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { imageDimensions } from '@assets'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { useEditor } from '@renderer/state/editor'
import { translate } from '@renderer/i18n'

export const isPreviewUrl = (url: string): boolean => {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

export const useCachedLinkPreview = (url: string | null) =>
  useQuery(
    {
      queryKey: ['link-preview', url],
      queryFn: () => (url ? requireDesktopAPI().getLinkPreview(url) : Promise.resolve(null)),
      enabled: url !== null && isPreviewUrl(url),
      retry: false,
      staleTime: Infinity,
    },
    queryClient,
  )

export const useLinkPreview = (topicId: string, url: string) => {
  const request = useRef(0)
  const active = useRef(false)
  useEffect(
    () => () => {
      request.current += 1
      active.current = false
    },
    [topicId, url],
  )
  const mutation = useMutation(
    {
      mutationFn: async (generation: number) => {
        const state = useEditor.getState()
        if (state.busy) return false
        state.commitDraft()
        if (useEditor.getState().editingId) return false
        const workbookId = state.workbook.id
        const sheetId = state.activeSheetId
        const asset = await requireDesktopAPI().generateLinkPreview(url)
        const current = useEditor.getState()
        const link = current.history.document.topics[topicId]?.metadata?.link
        if (
          generation !== request.current ||
          current.workbook.id !== workbookId ||
          current.activeSheetId !== sheetId ||
          current.selectedId !== topicId ||
          link?.kind !== 'url' ||
          link.url !== url
        )
          return false
        return current.command({ type: 'setTopicImage', topicId, asset, ...imageDimensions(asset) })
      },
    },
    queryClient,
  )
  return {
    loading: mutation.isPending,
    error: mutation.error ? mutation.error.message || translate('screenshotLinkFailed') : null,
    success: mutation.isSuccess && mutation.data,
    capture: () => {
      if (active.current) return
      active.current = true
      const generation = ++request.current
      mutation.mutate(generation, {
        onSettled: () => {
          if (generation === request.current) active.current = false
        },
      })
    },
    cancel: () => {
      request.current += 1
      active.current = false
      mutation.reset()
    },
  }
}
