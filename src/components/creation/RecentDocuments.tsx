import { useMessages } from '@renderer/i18n/useMessages'

import { BookOpen, File, RefreshCw } from 'lucide-react'
import { useRecentFiles } from '@renderer/hooks/useRecentFiles'
import { openDocument } from '@renderer/state/files'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'

export const RecentDocuments = ({ busy, onExample }: { busy: boolean; onExample: () => void }) => {
  const { translate } = useMessages()

  const recent = useRecentFiles()
  return (
    <aside
      className="flex min-w-0 flex-col items-start border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5"
      aria-label={translate('recentFiles')}
    >
      <h2 className="mb-3 text-sm font-semibold">{translate('recentlyOpened')}</h2>
      {recent.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loadingRecentFiles')}
        </p>
      )}
      {recent.isError && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-xs text-muted-foreground">
            {translate('couldNotLoadRecentFiles')}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={recent.isFetching}
            onClick={() => {
              void recent.refetch()
            }}
          >
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {translate('retry')}
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
                aria-label={translate('openRecentFileValue0', { value0: file.name })}
                title={file.path}
                className="h-11 w-full justify-start gap-3 px-2 text-left"
                onClick={() => void openDocument(file.path)}
              >
                <File
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="text-muted-foreground"
                />
                <span className="truncate">{file.name}</span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-6 text-muted-foreground">{translate('noRecentFiles')}</p>
        ))}
      <Separator className="my-4" />
      <Button type="button" variant="ghost" disabled={busy} onClick={onExample}>
        <BookOpen aria-hidden="true" data-icon="inline-start" />
        {translate('exploreExample')}
      </Button>
    </aside>
  )
}
