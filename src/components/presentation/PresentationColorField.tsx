import { useState } from 'react'
import { Input } from '@renderer/components/ui/input'

/** The native picker stays local while open; leaving it commits a single document command. */
export const PresentationColorField = ({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (color: string) => void
}) => {
  const [draft, setDraft] = useState(value)
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <Input
        aria-label={label}
        type="color"
        className="h-8 w-14 cursor-pointer border-border p-1"
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={() => {
          if (draft !== value) onChange(draft)
        }}
      />
    </label>
  )
}
