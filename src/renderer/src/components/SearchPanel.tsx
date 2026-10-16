import { useMemo, useState } from 'react'
import { searchWorkbook, type SearchMatch } from '@core'
import { useEditor } from '../state/editor'
import { isCompositionKey } from '../state/keyboard'
import { replaceSearchResults, revealSearchMatch, useSearch } from '../state/search'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

export function SearchPanel() {
  const search = useSearch()
  const workbook = useEditor((state) => state.workbook)
  const sheetId = useEditor((state) => state.activeSheetId)
  const [chosen, setChosen] = useState<SearchMatch | null>(null)
  const results = useMemo(
    () =>
      searchWorkbook(workbook, search.query, {
        matchCase: search.matchCase,
        wholeWord: search.wholeWord,
        includeNotes: search.includeNotes,
        ...(search.allSheets ? {} : { sheetId }),
      }),
    [
      workbook,
      sheetId,
      search.query,
      search.matchCase,
      search.wholeWord,
      search.includeNotes,
      search.allSheets,
    ],
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
          <DialogTitle>查找与替换</DialogTitle>
          <DialogDescription>
            查找主题标题和备注。替换操作仅作用于当前画布，可一次撤销。
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="查找文本"
          value={search.query}
          placeholder="输入要查找的文本"
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
              ['matchCase', '区分大小写'],
              ['wholeWord', '全词匹配'],
              ['includeNotes', '包含备注'],
              ['allSheets', '所有画布'],
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
            aria-label="替换为"
            value={search.replacement}
            placeholder="替换为（可留空）"
            onChange={(event) => {
              useSearch.setState({ replacement: event.target.value })
            }}
          />
          <Button
            variant="outline"
            disabled={selected?.sheetId !== sheetId}
            onClick={() => {
              if (selected) replaceSearchResults(selected)
            }}
          >
            替换此结果
          </Button>
          <Button
            disabled={!currentResults.length}
            onClick={() => {
              replaceSearchResults()
            }}
          >
            替换当前画布全部
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {search.query
            ? `共 ${results.reduce((count, match) => count + match.count, 0)} 处匹配，当前画布 ${currentResults.length} 个结果`
            : '输入文本开始查找'}
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto" aria-label="查找结果">
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
                  {match.field === 'notes' ? '备注' : '标题'} · {match.count} 处
                </span>
                <span className="block truncate">{match.text}</span>
              </span>
            </Button>
          ))}
          {search.query && results.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的主题</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
