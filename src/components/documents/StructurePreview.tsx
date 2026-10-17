import type { LayoutKind } from '@core'

type Point = readonly [number, number]
const horizontal: readonly Point[] = [
  [18, 36],
  [64, 16],
  [64, 36],
  [64, 56],
  [102, 16],
  [102, 36],
  [102, 56],
]
const vertical: readonly Point[] = [
  [60, 10],
  [24, 36],
  [60, 36],
  [96, 36],
  [24, 60],
  [60, 60],
  [96, 60],
]

const node = ([x, y]: Point, index: number) => {
  return (
    <rect
      key={index}
      x={x - 9}
      y={y - 5}
      width={18}
      height={10}
      rx={3}
      fill={index === 0 ? 'currentColor' : 'var(--ui-background)'}
      stroke="currentColor"
      strokeWidth={1.5}
    />
  )
}

/** Small code-native diagrams keep each structure recognizable without raster assets. */
export const StructurePreview = ({ kind }: { kind: LayoutKind }) => {
  const verticalLayout = [
    'org-down',
    'org-up',
    'tree-down',
    'tree-up',
    'tree-table-down',
    'timeline-vertical',
  ].includes(kind)
  const reverse = ['logic-left', 'brace-left', 'org-up', 'tree-up'].includes(kind)
  const transform = reverse
    ? verticalLayout
      ? 'translate(0 72) scale(1 -1)'
      : 'translate(120 0) scale(-1 1)'
    : undefined
  let points = verticalLayout ? vertical : horizontal
  let paths: readonly string[] = verticalLayout
    ? ['M60 15V24H24V31', 'M60 24V31', 'M60 24H96V31', 'M24 41V55', 'M60 41V55', 'M96 41V55']
    : ['M27 36H40V16H55', 'M40 36H55', 'M40 36V56H55', 'M73 16H93', 'M73 36H93', 'M73 56H93']
  if (kind === 'map') {
    points = [
      [60, 36],
      [20, 16],
      [20, 56],
      [100, 16],
      [100, 56],
    ]
    paths = ['M51 36H40V16H29', 'M40 36V56H29', 'M69 36H80V16H91', 'M80 36V56H91']
  } else if (kind === 'brace-right' || kind === 'brace-left') {
    paths = [
      'M27 36H33',
      'M47 11C35 11 47 36 35 36C47 36 35 61 47 61',
      'M50 16H55',
      'M50 36H55',
      'M50 56H55',
      'M73 16H93',
      'M73 36H93',
      'M73 56H93',
    ]
  } else if (kind === 'tree-down' || kind === 'tree-up') {
    points = [
      [60, 10],
      [30, 34],
      [90, 34],
      [15, 60],
      [45, 60],
      [75, 60],
      [105, 60],
    ]
    paths = [
      'M60 15L30 29',
      'M60 15L90 29',
      'M30 39L15 55',
      'M30 39L45 55',
      'M90 39L75 55',
      'M90 39L105 55',
    ]
  } else if (kind === 'timeline' || kind === 'timeline-vertical') {
    points = verticalLayout
      ? [
          [60, 10],
          [32, 30],
          [88, 48],
          [32, 64],
        ]
      : [
          [14, 36],
          [42, 14],
          [70, 58],
          [100, 14],
        ]
    paths = verticalLayout
      ? ['M60 15V68', 'M60 30H41', 'M60 48H79', 'M60 64H41']
      : ['M23 36H114', 'M42 36V19', 'M70 36V53', 'M100 36V19']
  } else if (kind === 'fishbone') {
    points = [
      [105, 36],
      [28, 12],
      [62, 12],
      [28, 60],
      [62, 60],
    ]
    paths = ['M8 36H96', 'M28 17L46 36L28 55', 'M62 17L80 36L62 55']
  } else if (kind === 'matrix') {
    points = [
      [20, 12],
      [60, 12],
      [100, 12],
      [20, 36],
      [60, 36],
      [100, 36],
      [20, 60],
      [60, 60],
      [100, 60],
    ]
    paths = ['M40 2V70', 'M80 2V70', 'M4 24H116', 'M4 48H116']
  } else if (kind === 'tree-table-right' || kind === 'tree-table-down') {
    paths = verticalLayout
      ? ['M6 22H114M6 46H114M6 70H114M6 22V70M42 22V70M78 22V70M114 22V70', 'M60 15V22']
      : ['M40 4H116V68H40ZM40 25H116M40 47H116M78 4V68', 'M27 36H40']
  }
  return (
    <svg
      viewBox="0 0 120 72"
      className="size-auto h-14 w-full text-primary"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={transform}>
        {paths.map((path, index) => (
          <path
            key={index}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}
        {points.map(node)}
      </g>
    </svg>
  )
}
