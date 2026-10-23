import { sketchFillPath, topicOutlinePath, visualPath } from '@shared/sketch'
import type { SheetVisualStyle, TopicShape } from '@core'
import { topicShapePath } from '@shared/topic-shapes'
import { topicShapeImage } from '@renderer/lib/topicShapeImage'

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
  cached = false,
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
  cached?: boolean
}) => {
  const image =
    cached && visualStyle !== 'sketch' ? topicShapeImage(shape, width, height, fill, stroke) : null
  if (image)
    return (
      <img
        aria-hidden
        alt=""
        src={image.src}
        decoding="async"
        className={`${className ?? ''} max-w-none`}
        width={image.width}
        height={image.height}
        style={{
          position: 'absolute',
          left: -3,
          top: -3,
          width: image.width,
          height: image.height,
        }}
      />
    )
  return (
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
              />
            )}
            <path
              data-sketch="outline"
              d={visualPath(
                topicOutlinePath(shape, width, height),
                visualStyle,
                `topic:${seedKey}`,
              )}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
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
          />
        ) : (
          <path
            d={topicShapePath(shape, width, height)}
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
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
        />
      )}
    </svg>
  )
}
