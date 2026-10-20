import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import type { SearchMatch } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useDocumentSearch } from '@renderer/hooks/useDocumentSearch'
import { isCompositionKey } from '@renderer/state/keyboard'
import { replaceSearchResults, revealSearchMatch, useSearch } from '@renderer/state/search'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'

export const SearchPanel = () => {
  const { translate } = useMessages()

  const search = useSearch()
  const workbook = useEditor((state) => state.workbook)
  const sheetId = useEditor((state) => state.activeSheetId)
  const [chosen, setChosen] = useState<SearchMatch | null>(null)
  const [replacing, setReplacing] = useState(false)
  const { results, loading, error, retry } = useDocumentSearch(
    workbook.id,
    search.query,
    {
      matchCase: search.matchCase,
      wholeWord: search.wholeWord,
      includeNotes: search.includeNotes,
      ...(search.allSheets ? {} : { sheetId }),
    },
    search.open,
  )
  const currentResults = results.filter((match) => match.sheetId === sheetId)
  const selected =
    chosen &&
    results.find(
      (match) =>
        match.topicId === chosen.topicId &&
        match.sheetId === chosen.sheetId &&
        match.field === chosen.field,
    )
  const locate = (match: SearchMatch): void => {
    setChosen(match)
    revealSearchMatch(match)
  }
  return (
    <Dialog
      open={search.open}
      onOpenChange={(open) => {
        useSearch.setState({ open })
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{translate('findAndReplace')}</DialogTitle>
          <DialogDescription>
            {translate('findTopicTitlesAndNotesReplacementsAffect')}
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label={translate('findText')}
          value={search.query}
          placeholder={translate('enterTextToFind')}
          onChange={(event) => {
            useSearch.setState({ query: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isCompositionKey(event.nativeEvent) && results[0]) {
              event.preventDefault()
              locate(results[0])
            }
          }}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {(
            [
              ['matchCase', translate('matchCase')],
              ['wholeWord', translate('wholeWords')],
              ['includeNotes', translate('includeNotes')],
              ['allSheets', translate('allSheets')],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              aria-pressed={search[key]}
              className="aria-pressed:border-primary aria-pressed:bg-accent"
              onClick={() => {
                useSearch.setState({ [key]: !search[key] })
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-32 flex-1"
            aria-label={translate('replaceWith')}
            value={search.replacement}
            placeholder={translate('replaceWithOptional')}
            onChange={(event) => {
              useSearch.setState({ replacement: event.target.value })
            }}
          />
          <Button
            variant="outline"
            disabled={selected?.sheetId !== sheetId || loading || replacing}
            onClick={() => {
              if (!selected) return
              setReplacing(true)
              void Promise.resolve(replaceSearchResults(selected)).finally(() => {
                setReplacing(false)
              })
            }}
          >
            {translate('replaceThisResult')}
          </Button>
          <Button
            disabled={!currentResults.length || loading || replacing}
            onClick={() => {
              setReplacing(true)
              void Promise.resolve(replaceSearchResults()).finally(() => {
                setReplacing(false)
              })
            }}
          >
            {translate('replaceAllOnThisSheet')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {loading
            ? translate('loading')
            : error
              ? translate('operationFailedPleaseRetry')
              : search.query
                ? translate('value0MatchesValue1ResultsOnThisSheet', {
                    value0: results.reduce((count, match) => count + match.count, 0),
                    value1: currentResults.length,
                  })
                : translate('enterTextToSearch')}
        </p>
        {error && (
          <Button variant="outline" onClick={() => void retry()}>
            {translate('retry')}
          </Button>
        )}
        <div className="max-h-72 space-y-1 overflow-y-auto" aria-label={translate('searchResults')}>
          {results.map((match) => (
            <Button
              key={`${match.sheetId}:${match.topicId}:${match.field}`}
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
              aria-pressed={selected === match}
              onClick={() => {
                locate(match)
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-muted-foreground">
                  {workbook.sheets.find((sheet) => sheet.id === match.sheetId)?.name} ·{' '}
                  {match.field === 'notes' ? translate('notes') : translate('title')} ·{' '}
                  {match.count}
                  {translate('matches')}
                </span>
                <span className="block truncate">{match.text}</span>
              </span>
            </Button>
          ))}
          {search.query && !loading && !error && results.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {translate('noMatchingTopics')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
