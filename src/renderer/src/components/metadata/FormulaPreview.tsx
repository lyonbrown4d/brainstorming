import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export default function FormulaPreview({ source }: { source: string }) {
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
      aria-label={`公式预览 ${source}`}
    />
  )
}
