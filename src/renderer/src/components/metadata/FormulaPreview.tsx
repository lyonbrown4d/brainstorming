import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export const FormulaPreview = ({ source }: { source: string }) => {
  const { translate } = useMessages()

  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    katex.render(source, target.current, {
      trust: false,
      throwOnError: false,
      strict: 'error',
      maxExpand: 1000,
      maxSize: 10,
      displayMode: true,
    })
  }, [source])
  return (
    <div
      ref={target}
      className="overflow-x-auto rounded border bg-background p-2 text-sm"
      aria-label={translate('formulaPreviewValue0', { value0: source })}
    />
  )
}

export default FormulaPreview
