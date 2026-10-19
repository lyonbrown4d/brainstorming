import { useEffect, useState } from 'react'
import type { MindMapWorkbook } from '@core'
import { prepareSheetImage } from '@renderer/export/images'
import type { SheetSvg } from '@renderer/export/svg'

interface PreparedPreview {
  readonly workbook: MindMapWorkbook
  readonly sheetId: string
  readonly includeCollapsed: boolean
  readonly source: SheetSvg | null
  readonly url: string | null
  readonly error: unknown
}

export const useExportPreview = (
  workbook: MindMapWorkbook,
  sheetId: string,
  includeCollapsed: boolean,
) => {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<PreparedPreview | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let url: string | null = null
    void prepareSheetImage(workbook, sheetId, includeCollapsed, controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(new Blob([source.svg], { type: 'image/svg+xml;charset=utf-8' }))
        setResult({ workbook, sheetId, includeCollapsed, source, url, error: null })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ workbook, sheetId, includeCollapsed, source: null, url: null, error })
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [workbook, sheetId, includeCollapsed, version])
  const current =
    result?.workbook === workbook &&
    result.sheetId === sheetId &&
    result.includeCollapsed === includeCollapsed
      ? result
      : null
  return {
    source: current?.source ?? null,
    url: current?.url ?? null,
    error: current?.error ?? null,
    loading: !current,
    retry: () => {
      setResult(null)
      setVersion((value) => value + 1)
    },
  }
}
