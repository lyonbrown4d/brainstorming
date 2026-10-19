import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Image, Search } from 'lucide-react'
import { artGroups, artText, builtinArtCatalogSchema, matchesArt } from '@shared/builtinArt'
import type { MessageKey } from '@renderer/i18n'
import { useMessages } from '@renderer/i18n/useMessages'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { useEditor } from '@renderer/state/editor'
import { insertBuiltinArt } from '@renderer/state/builtinArt'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

const groupLabels: Record<(typeof artGroups)[number], MessageKey> = {
  ideas: 'builtinArtIdeas',
  plans: 'builtinArtPlans',
  feelings: 'builtinArtFeelings',
  nature: 'builtinArtNature',
  scenes: 'builtinArtScenes',
}
export const BuiltinArtPicker = ({ topicId }: { topicId: string }) => {
  const { translate } = useMessages()
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const busy = useEditor((state) => state.busy)
  const hasImage = useEditor((state) => Boolean(state.history.document.topics[topicId]?.image))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [pending, setPending] = useState<string | null>(null)
  const catalog = useQuery(
    {
      queryKey: ['builtin-art', 'catalog'],
      queryFn: async () =>
        builtinArtCatalogSchema.parse(await requireDesktopAPI().listBuiltinArt()),
      enabled: open,
      staleTime: Infinity,
      retry: false,
    },
    queryClient,
  )
  const items =
    catalog.data?.items.filter(
      (item) => (group === 'all' || item.group === group) && matchesArt(item, query),
    ) ?? []
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={busy} className="h-[31px] gap-[5px] px-[9px] text-xs">
          <Image size={14} aria-hidden="true" />
          {translate('builtinArt')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-[352px] max-w-[calc(100vw-24px)] space-y-3 p-3"
        aria-label={translate('builtinArt')}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{translate('builtinArt')}</h3>
          <span className="text-[11px] text-muted-foreground">
            {translate('builtinArtOffline')}
          </span>
        </div>
        <div className="relative">
          <Search
            className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-9 pl-9 text-xs"
            value={query}
            placeholder={translate('builtinArtSearch')}
            aria-label={translate('builtinArtSearch')}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={translate('builtinArt')}>
          {(['all', ...artGroups] as const).map((id) => (
            <Button
              key={id}
              size="sm"
              variant={group === id ? 'secondary' : 'ghost'}
              aria-pressed={group === id}
              className="h-7 px-2 text-xs"
              onClick={() => {
                setGroup(id)
              }}
            >
              {translate(id === 'all' ? 'builtinArtAll' : groupLabels[id])}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {translate(hasImage ? 'builtinArtReplace' : 'builtinArtInsert')}
        </p>
        <ScrollArea className="h-[280px]" aria-label={translate('builtinArt')}>
          {catalog.isPending && (
            <LoadingState
              className="p-4"
              variant="surface"
              label={translate('builtinArtLoading')}
            />
          )}
          {catalog.isError && (
            <div role="alert" className="space-y-2 p-3 text-xs">
              <p>{translate('builtinArtLoadFailed')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void catalog.refetch()
                }}
              >
                {translate('retry')}
              </Button>
            </div>
          )}
          {catalog.isSuccess && items.length === 0 && (
            <p role="status" className="p-4 text-xs text-muted-foreground">
              {translate('builtinArtEmpty')}
            </p>
          )}
          <div className="grid grid-cols-4 gap-1.5 pr-2">
            {items.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                disabled={busy || pending !== null}
                className="h-[84px] min-w-0 flex-col gap-1 px-1 py-2"
                aria-label={`${translate(hasImage ? 'replaceImage' : 'addImage')} · ${artText(item.title, language)}`}
                title={`${artText(item.title, language)} · ${item.source === 'original' ? translate('builtinArtOriginal') : 'Microsoft Fluent Emoji · MIT'}`}
                onClick={() => {
                  setPending(item.id)
                  void insertBuiltinArt(topicId, item.id)
                    .then((inserted) => {
                      if (inserted) setOpen(false)
                    })
                    .finally(() => {
                      setPending(null)
                    })
                }}
              >
                {pending === item.id ? (
                  <LoadingIndicator className="size-9" />
                ) : (
                  <img src={item.thumbnail} alt="" className="size-11 object-contain" />
                )}
                <span className="block w-full truncate text-center text-[10px] font-normal">
                  {artText(item.title, language)}
                </span>
              </Button>
            ))}
          </div>
        </ScrollArea>
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            {translate('builtinArtSources')}
          </summary>
          <p className="mt-2">{translate('builtinArtSourceNote')}</p>
          <p className="mt-1 break-all">github.com/microsoft/fluentui-emoji</p>
          <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans">
            {catalog.data?.licenseText}
          </pre>
        </details>
      </PopoverContent>
    </Popover>
  )
}
