import { sketchFillPath, topicOutlinePath, visualPath } from '@shared/sketch'
import type { SheetVisualStyle, TopicShape } from '@core'
import { topicShapePath } from '@shared/topic-shapes'

export const TopicShapeVisual = ({
  shape,
  fill = 'var(--topic-fill, var(--color-background))',
  stroke = 'var(--branch-color, currentColor)',
  className,
  width = 100,
  height = 100,
  visualStyle,
  sketchFill = true,
  seedKey = shape,
}: {
  shape: TopicShape
  fill?: string
  stroke?: string
  className?: string
  width?: number
  height?: number
  visualStyle?: SheetVisualStyle | undefined
  sketchFill?: boolean
  seedKey?: string
}) => (
  <svg
    aria-hidden
    viewBox={`0 0 ${width} ${height}`}
    preserveAspectRatio="none"
    className={className}
    overflow="visible"
  >
    {shape !== 'text' &&
      (visualStyle === 'sketch' ? (
        <>
          <path d={topicOutlinePath(shape, width, height)} fill={fill} stroke="none" />
          {sketchFill && (
            <path
              data-sketch="fill"
              d={sketchFillPath(topicOutlinePath(shape, width, height), `topic:${seedKey}`)}
              fill="none"
              stroke={stroke}
              strokeOpacity="0.1"
              strokeWidth="0.8"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            data-sketch="outline"
            d={visualPath(topicOutlinePath(shape, width, height), visualStyle, `topic:${seedKey}`)}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : shape === 'ellipse' || shape === 'circle' ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <path
          d={topicShapePath(shape, width, height)}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    {shape === 'sticky' && (
      <path
        d={visualPath(
          `M${width * 0.84} ${height} V${height * 0.84} H${width}`,
          visualStyle,
          `topic:${seedKey}:fold`,
        )}
        fill="none"
        stroke={stroke}
        vectorEffect="non-scaling-stroke"
      />
    )}
    {shape === 'card' && (
      <path
        d={visualPath(
          `M${width * 0.08} ${height * 0.12} H${width * 0.92}`,
          visualStyle,
          `topic:${seedKey}:header`,
        )}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    )}
  </svg>
)
