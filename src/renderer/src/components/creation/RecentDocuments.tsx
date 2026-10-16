import { File, RefreshCw } from 'lucide-react'
import { useRecentFiles } from '../../hooks/useRecentFiles'
import { openDocument } from '../../state/files'
import { Button } from '../ui/button'

export function RecentDocuments({ busy }: { busy: boolean }) {
  const recent = useRecentFiles()
  return (
    <aside
      className="border-t bg-background px-6 py-8 xl:w-64 xl:shrink-0 xl:border-t-0 xl:border-l"
      aria-label="最近文件"
    >
      <h2 className="mb-4 text-sm font-semibold">最近打开</h2>
      {recent.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          正在读取最近文件…
        </p>
      )}
      {recent.isError && (
        <div className="space-y-3">
          <p role="alert" className="text-xs text-muted-foreground">
            最近文件读取失败。
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={recent.isFetching}
            onClick={() => {
              void recent.refetch()
            }}
          >
            <RefreshCw className="size-4" />
            重新读取
          </Button>
        </div>
      )}
      {recent.isSuccess &&
        (recent.data.length ? (
          <div className="space-y-2">
            {recent.data.map((file) => (
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
