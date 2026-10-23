import { useEffect, useState } from 'react'
import { useLockFn } from 'ahooks'
import type { DocumentExportsAPI, ExportPage } from '@shared/documentExports'
import { captureCurrentExportView } from '@renderer/export/captureCurrentExportView'
import { useMessages } from '@renderer/i18n/useMessages'

export const useExportViewPreview = (
  api: DocumentExportsAPI,
  onError: (message: string) => void,
) => {
  const { translate } = useMessages()
  const [page, setPage] = useState<ExportPage | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  const capture = useLockFn(async (): Promise<void> => {
    try {
      const next = await captureCurrentExportView(api)
      setPage(next)
      setUrl(URL.createObjectURL(new Blob([next.svg], { type: 'image/svg+xml;charset=utf-8' })))
    } catch (error) {
      onError(error instanceof Error ? error.message : translate('exportPreviewFailed'))
    }
  })
  return { page, url, capture }
}
