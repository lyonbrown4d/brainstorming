import { useEffect, useState } from 'react'
import { File, RefreshCw } from 'lucide-react'
import type { RecentFile } from '@shared/contracts'
import { openDocument } from '../../state/files'
import { Button } from '../ui/button'

type RecentState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; files: readonly RecentFile[] }

export function RecentDocuments({ busy }: { busy: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const [recent, setRecent] = useState<RecentState>(() =>
    window.trelyx ? { status: 'loading' } : { status: 'ready', files: [] },
  )
  useEffect(() => {
    let active = true
    const bridge = window.trelyx
    if (!bridge) return
    void bridge.getRecentFiles().then(
      (files) => {
        if (active) setRecent({ status: 'ready', files })
      },
      () => {
        if (active) setRecent({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])
  return (
    <aside
      className="border-t bg-background px-6 py-8 xl:w-64 xl:shrink-0 xl:border-t-0 xl:border-l"
      aria-label="最近文件"
    >
      <h2 className="mb-4 text-sm font-semibold">最近打开</h2>
      {recent.status === 'loading' && (
        <p role="status" className="text-xs text-muted-foreground">
          正在读取最近文件…
        </p>
      )}
      {recent.status === 'error' && (
        <div className="space-y-3">
          <p role="alert" className="text-xs text-muted-foreground">
            最近文件读取失败。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRecent({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          >
            <RefreshCw className="size-4" />
            重新读取
          </Button>
        </div>
      )}
      {recent.status === 'ready' &&
        (recent.files.length ? (
          <div className="space-y-2">
            {recent.files.map((file) => (
              <Button
                key={file.path}
                variant="ghost"
                disabled={busy}
                aria-label={`打开最近文件 ${file.name}`}
                title={file.path}
                className="h-auto w-full justify-start gap-2 px-2 py-3 text-left"
                onClick={() => void openDocument(file.path)}
              >
                <File className="size-4 shrink-0 text-primary" />
                <span className="truncate">{file.name}</span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-6 text-muted-foreground">
            {window.trelyx ? '还没有最近打开的文件。' : '桌面版会在这里显示最近打开的文件。'}
          </p>
        ))}
    </aside>
  )
}
