import type { DocumentPalette } from '@core/extensions'
import { paletteAppearance } from '@shared/palettes'

/** Data-driven miniature of the real map, never a raster screenshot or decorative illustration. */
export const PalettePreview = ({ palette }: { palette: DocumentPalette }) => {
  const resolved = paletteAppearance(palette)
  const points = [
    { x: 23, y: 22 },
    { x: 23, y: 58 },
    { x: 137, y: 22 },
    { x: 137, y: 58 },
  ]
  return (
    <svg
      viewBox="0 0 160 80"
      aria-hidden="true"
      className="size-auto! h-14! w-full! shrink-0 rounded-t-md"
      style={{ background: palette.background }}
    >
      {points.map(({ x, y }, index) => (
        <g key={index}>
          <path
            d={`M80 40 C ${x} 40, 80 ${y}, ${x} ${y}`}
            fill="none"
            stroke={palette.branches[index]}
            strokeWidth={2}
          />
          <rect
            x={x - 13}
            y={y - 6}
            width={26}
            height={12}
            rx={4}
            fill={resolved.fills[index]}
            stroke={palette.branches[index]}
            strokeWidth={0.5}
          />
          <path
            d={`M${x < 80 ? 0 : 150} ${y}H${x < 80 ? 10 : 160}`}
            stroke={palette.branches[index]}
            strokeWidth={1.5}
          />
        </g>
      ))}
      <rect x={60} y={32} width={40} height={16} rx={5} fill={palette.root} />
    </svg>
  )
}
