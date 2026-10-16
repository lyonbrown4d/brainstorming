import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export function FieldSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string
  value: T
  options: readonly { readonly value: T; readonly label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next)
        if (option) onChange(option.value)
      }}
    >
      <SelectTrigger
        className={`field-select h-9 min-w-0 rounded-[7px] border-border bg-background px-2.5 py-0 text-[13px] text-foreground ${className}`}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="field-select-content z-[80]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
