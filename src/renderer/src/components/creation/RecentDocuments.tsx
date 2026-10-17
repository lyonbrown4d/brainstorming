import { BookOpen, File, RefreshCw } from 'lucide-react'
import { useRecentFiles } from '@renderer/hooks/useRecentFiles'
import { openDocument } from '@renderer/state/files'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'

export const RecentDocuments = ({ busy, onExample }: { busy: boolean; onExample: () => void }) => {
  const recent = useRecentFiles()
  return (
    <aside
      className="flex min-w-0 flex-col items-start border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
      aria-label="最近文件"
    >
      <h2 className="mb-5 text-lg font-semibold">最近打开</h2>
      {recent.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          正在读取最近文件…
        </p>
      )}
      {recent.isError && (
        <div className="flex flex-col gap-3">
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
            <RefreshCw data-icon="inline-start" />
            重新读取
          </Button>
        </div>
      )}
      {recent.isSuccess &&
        (recent.data.length ? (
          <div className="w-full divide-y divide-border">
            {recent.data.map((file) => (
              <Button
                key={file.path}
                variant="ghost"
                disabled={busy}
                aria-label={`打开最近文件 ${file.name}`}
                title={file.path}
                className="h-20 w-full justify-start gap-3 px-2 text-left"
                onClick={() => void openDocument(file.path)}
              >
                <File data-icon="inline-start" className="text-primary" />
                <span className="truncate">{file.name}</span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-6 text-muted-foreground">暂无最近文件</p>
        ))}
      <Separator className="my-6" />
      <Button type="button" variant="ghost" disabled={busy} onClick={onExample}>
        <BookOpen data-icon="inline-start" />
        探索示例
      </Button>
    </aside>
  )
}
