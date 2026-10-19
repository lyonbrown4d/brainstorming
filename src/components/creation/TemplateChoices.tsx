import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Minus, Search, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useTemplates } from '@renderer/hooks/useTemplates'
import { templateText } from '@shared/templates'
import type { CreationRequest } from '@renderer/components/creation/types'
import { useMessages } from '@renderer/i18n/useMessages'
import { isCompositionKey } from '@renderer/state/keyboard'
import { TemplateIcon, templateGroupAppearance } from '@renderer/components/creation/creationIcons'
import { cn } from '@renderer/lib/utils'

const groups = [
  { id: 'ideate', label: 'templateIdeate' },
  { id: 'plan', label: 'templatePlan' },
  { id: 'analyze', label: 'templateAnalyze' },
  { id: 'learn', label: 'templateLearn' },
] as const

export const TemplateChoices = ({
  value,
  onChange,
  disabled,
  includeBlank = true,
  scrollMode = 'contained',
}: {
  value: CreationRequest['template']
  onChange: (template: CreationRequest['template']) => void
  disabled: boolean
  includeBlank?: boolean
  scrollMode?: 'contained' | 'page'
}) => {
  const List = scrollMode === 'contained' ? ScrollArea : 'div'
  const { translate } = useMessages()
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const catalog = useTemplates()
  const templateOptions = catalog.data?.templates ?? []
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase()
  const filtered = templateOptions.filter((option) =>
    [...option.title, ...option.description, option.id]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search),
  )
  const selected = templateOptions.find((option) => option.id === value)
  return (
    <div
      className="@container space-y-3"
      role="group"
      aria-label={translate('chooseInitialContent')}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            disabled={disabled}
            aria-label={translate('templateSearch')}
            placeholder={translate('templateSearchPlaceholder')}
            className="h-9 bg-background pr-9 pl-9 text-xs [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => {
              setQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query && !isCompositionKey(event.nativeEvent)) {
                event.preventDefault()
                event.stopPropagation()
                setQuery('')
              }
              if (event.key === 'Enter' && !isCompositionKey(event.nativeEvent))
                event.preventDefault()
            }}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={translate('templateClearSearch')}
              className="absolute top-0.5 right-0.5 size-8"
              onClick={() => {
                setQuery('')
              }}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          )}
        </div>
        {includeBlank && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-pressed={value === 'blank'}
            onClick={() => {
              onChange('blank')
            }}
            className="h-9 gap-1.5 px-2.5 text-xs shadow-none aria-pressed:border-primary aria-pressed:bg-primary/5"
          >
            <Minus aria-hidden="true" className="size-3.5" />
            {translate('noTemplate')}
            {value === 'blank' && <Check aria-hidden="true" className="size-3.5" />}
          </Button>
        )}
      </div>
      <List className={scrollMode === 'contained' ? 'h-64' : undefined}>
        <div className="space-y-4">
          {groups.map((group) => {
            const options = filtered.filter((option) => option.group === group.id)
            const appearance = templateGroupAppearance[group.id]
            if (!options.length) return null
            return (
              <section key={group.id} aria-label={translate(group.label)} className="space-y-1">
                <h3 className="px-1 py-1 text-xs font-medium text-muted-foreground">
                  {translate(group.label)}
                </h3>
                <div className="grid gap-2 @min-[28rem]:grid-cols-2">
                  {options.map((option) => {
                    const title = templateText(option.title, language)
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        aria-label={translate('chooseValue0Template', { value0: title })}
                        aria-pressed={value === option.id}
                        onClick={() => {
                          onChange(option.id)
                        }}
                        className="h-auto min-h-18 min-w-0 items-start justify-start gap-2.5 rounded-md border-border bg-background p-3 text-left shadow-none aria-pressed:border-primary aria-pressed:bg-primary/5"
                      >
                        <span
                          className={cn(
                            'inline-flex size-8 shrink-0 items-center justify-center rounded-md',
                            appearance.className,
                          )}
                        >
                          <TemplateIcon icon={option.icon} />
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal">
                          <span className="block text-xs font-medium">{title}</span>
                          <span className="mt-1 block text-[11px] leading-relaxed font-normal text-muted-foreground">
                            {templateText(option.description, language)}
                          </span>
                        </span>
                        {value === option.id && (
                          <Check
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0 text-primary"
                          />
                        )}
                      </Button>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {catalog.isPending && (
            <LoadingState className="p-3" label={translate('templateLoading')} />
          )}
          {catalog.isError && (
            <div className="space-y-2 p-3">
              <p role="alert" className="text-xs text-destructive">
                {translate('templateLoadFailed')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || catalog.isFetching}
                onClick={() => {
                  void catalog.refetch()
                }}
              >
                {translate('templateRetry')}
              </Button>
            </div>
          )}
          {!catalog.isPending && !catalog.isError && !filtered.length && (
            <p role="status" className="px-3 py-8 text-center text-xs text-muted-foreground">
              {translate(templateOptions.length ? 'templateNoResults' : 'templateEmpty')}
            </p>
          )}
        </div>
      </List>
      {(selected !== undefined || includeBlank) && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selected
            ? `${templateText(selected.title, language)} · ${translate('templateTopicCount', { value0: selected.count })}`
            : value === 'blank'
              ? translate('noTemplate')
              : ''}
        </p>
      )}
    </div>
  )
}
