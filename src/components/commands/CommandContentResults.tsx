import { FileText } from 'lucide-react'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { CommandGroup, CommandItem } from '@renderer/components/ui/command'
import { useMessages } from '@renderer/i18n/useMessages'
import type { ContentSearchResult } from '@shared/contentSearch'
import { openContentSearchResult } from '@renderer/state/contentIndexNavigation'
import { commandPaletteAvailable } from '@renderer/state/commandPalette'

interface CommandContentResultsProps {
  query: string
  results: readonly ContentSearchResult[]
  pending: boolean
  error: boolean
  disabled: boolean
  select: (operation: () => void) => void
}

export const CommandContentResults = ({
  query,
  results,
  pending,
  error,
  disabled,
  select,
}: CommandContentResultsProps) => {
  const { translate } = useMessages()
  if (!query.trim() || pending || error) {
    return (
      <CommandGroup heading={translate('commandContentGroup')} forceMount>
        {query.trim() && pending ? (
          <LoadingState className="px-2 py-3" label={translate('commandContentSearching')} />
        ) : (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground" role="status">
            {translate(!query.trim() ? 'commandContentSearchHint' : 'commandContentError')}
          </p>
        )}
      </CommandGroup>
    )
  }
  return (
    <CommandGroup heading={translate('commandContentGroup')}>
      {results.map((result) => (
        <CommandItem
          key={`${result.workbookId}:${result.sheetId}:${result.topicId}`}
          value={`content:${result.workbookId}:${result.sheetId}:${result.topicId}`}
          disabled={disabled}
          className="items-start gap-3 px-2 py-2.5"
          onSelect={() => {
            select(() => {
              if (commandPaletteAvailable()) openContentSearchResult(result)
            })
          }}
        >
          <FileText className="mt-0.5 size-4" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[13px] font-medium">{result.title}</span>
            <span className="truncate text-[10px] text-muted-foreground">
              {result.workbookTitle} · {result.sheetName}
            </span>
            <span className="truncate text-xs text-muted-foreground">{result.snippet}</span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
