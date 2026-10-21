import { Slider as SliderPrimitive } from 'radix-ui'

/** Compose Radix directly so the thumb has a name without patching the vendored shadcn Slider. */
export const SpatialAngleControl = ({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onCommit: () => void
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}°</span>
    </div>
    <SliderPrimitive.Root
      data-slot="slider"
      className="relative flex w-full touch-none items-center select-none"
      min={min}
      max={max}
      step={1}
      value={[value]}
      onValueChange={([next]) => {
        if (next !== undefined) onChange(next)
      }}
      onValueCommit={onCommit}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden"
      />
    </SliderPrimitive.Root>
  </div>
)
