import { isCompositionKey } from '@renderer/state/keyboard'
import { useId, useState } from 'react'
import type { DocumentPalette } from '@core/extensions'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { PalettePreview } from '@renderer/components/appearance/PalettePreview'

export const CustomPaletteEditor = ({
  initial,
  onSave,
}: {
  initial: DocumentPalette
  onSave: (palette: DocumentPalette) => void
}) => {
  const [draft, setDraft] = useState<DocumentPalette>(() => ({
    name: initial.name,
    root: initial.root,
    branches: initial.branches,
    background: initial.background,
  }))
  const id = useId()
  const entries = [draft.root, ...draft.branches, draft.background]
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <PalettePreview palette={draft} />
      <div className="space-y-2">
        <Label htmlFor={id}>配色名称</Label>
        <Input
          id={id}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && isCompositionKey(event.nativeEvent)) event.preventDefault()
          }}
          required
          maxLength={40}
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value })
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {entries.map((color, index) => {
          const label = index === 0 ? '中心主题' : index === 6 ? '画布背景' : `分支 ${index}`
          return (
            <div key={index} className="flex items-center justify-between gap-2">
              <Label htmlFor={`${id}-${index}`} className="text-xs">
                {label}
              </Label>
              <Input
                type="color"
                id={`${id}-${index}`}
                aria-label={label}
                className="h-8 w-14 p-1"
                value={color}
                onChange={(event) => {
                  const value = event.target.value
                  if (index === 0) setDraft({ ...draft, root: value })
                  else if (index === 6) setDraft({ ...draft, background: value })
                  else {
                    const branches = [...draft.branches] as [string, string, string, string, string]
                    branches[index - 1] = value
                    setDraft({ ...draft, branches })
                  }
                }}
              />
            </div>
          )
        })}
      </div>
      <Button type="submit" className="w-full" disabled={!draft.name.trim()}>
        应用配色
      </Button>
    </form>
  )
}
