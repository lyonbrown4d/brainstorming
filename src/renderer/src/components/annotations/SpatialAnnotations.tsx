import { CubicBezierLine, Html, Line } from '@react-three/drei'
import type { RefObject } from 'react'
import type { MindMapDocument } from '@core'
import type { SpatialLayout } from '@layout/spatial'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'
import { groupBounds } from '@renderer/components/annotations/projection'

type Point = [number, number, number]
const arrowPoints = (from: Point, to: Point): Point[] => {
  const dx = to[0] - from[0],
    dy = to[1] - from[1]
  const length = Math.hypot(dx, dy) || 1
  const ux = (dx / length) * 0.12,
    uy = (dy / length) * 0.12
  return [
    [to[0] - ux - uy * 0.5, to[1] - uy + ux * 0.5, to[2]],
    to,
    [to[0] - ux + uy * 0.5, to[1] - uy - ux * 0.5, to[2]],
  ]
}
export const SpatialAnnotations = ({
  document,
  layout,
  labelPortal,
}: {
  document: MindMapDocument
  layout: SpatialLayout
  labelPortal: RefObject<HTMLDivElement>
}) => {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  return (
    <>
      {(document.relations ?? []).map((relation) => {
        const from = byId.get(relation.from),
          to = byId.get(relation.to)
        if (!from || !to) return null
        const start: Point = [
          from.position[0],
          from.position[1] + from.height / 2,
          from.position[2],
        ]
        const end: Point = [to.position[0], to.position[1] + to.height / 2, to.position[2]]
        const color = relation.color ?? '#8b79d9'
        return (
          <group key={relation.id}>
            <CubicBezierLine
              start={start}
              end={end}
              midA={[start[0], start[1] + 0.7, start[2]]}
              midB={[end[0], end[1] + 0.7, end[2]]}
              color={color}
              lineWidth={relation.width ?? 2}
              dashed={relation.dashed ?? false}
              dashSize={0.1}
              gapSize={0.07}
            />
            {relation.arrow !== 'none' && (
              <Line
                points={arrowPoints(start, end)}
                color={color}
                lineWidth={relation.width ?? 2}
              />
            )}
            {relation.arrow === 'both' && (
              <Line
                points={arrowPoints(end, start)}
                color={color}
                lineWidth={relation.width ?? 2}
              />
            )}
            {relation.title && (
              <Html
                portal={labelPortal}
                position={[
                  (start[0] + end[0]) / 2,
                  (start[1] + end[1]) / 2 + 0.55,
                  (start[2] + end[2]) / 2,
                ]}
                center
                zIndexRange={[12, 1]}
                style={{ pointerEvents: 'none' }}
              >
                <InlineAnnotationLabel
                  kind="relation"
                  id={relation.id}
                  text={relation.title.trim() ? relation.title : '关联线'}
                  color={color}
                />
              </Html>
            )}
          </group>
        )
      })}
      {(document.groups ?? []).map((group) => {
        const members = group.topicIds.flatMap((id) => {
          const node = byId.get(id)
          return node ? [node] : []
        })
        const bounds = groupBounds(
          members.map((node) => ({
            x: node.position[0] * 100 - node.width * 50,
            y: -node.position[1] * 100 - node.height * 50,
            width: node.width * 100,
            height: node.height * 100,
          })),
        )
        if (!bounds) return null
        const left = bounds.x / 100,
          right = (bounds.x + bounds.width) / 100
        const top = -bounds.y / 100,
          bottom = -(bounds.y + bounds.height) / 100
        const z = Math.min(...members.map((node) => node.position[2])) - 0.15
        const color = group.color ?? '#8b79d9'
        const points: Point[] =
          group.kind === 'summary'
            ? [
                [right, top, z],
                [right, bottom, z],
              ]
            : [
                [left, top, z],
                [right, top, z],
                [right, bottom, z],
                [left, bottom, z],
                [left, top, z],
              ]
        return (
          <group key={group.id}>
            <Line
              points={points}
              color={color}
              lineWidth={1.5}
              dashed={group.kind === 'boundary'}
              dashSize={0.12}
              gapSize={0.08}
            />
            <Html
              portal={labelPortal}
              position={[group.kind === 'summary' ? right : left, top + 0.15, z]}
              zIndexRange={[12, 1]}
              style={{ pointerEvents: 'none' }}
            >
              <InlineAnnotationLabel
                kind="group"
                id={group.id}
                text={
                  group.title?.trim() ? group.title : group.kind === 'summary' ? '概要' : '边界'
                }
                color={color}
              />
            </Html>
          </group>
        )
      })}
      {(document.callouts ?? []).map((callout) => {
        const node = byId.get(callout.topicId)
        return node ? (
          <Html
            key={callout.id}
            portal={labelPortal}
            position={[
              node.position[0] + node.width / 2 + 0.15,
              node.position[1] + node.height / 2,
              node.position[2],
            ]}
            zIndexRange={[14, 1]}
            style={{ pointerEvents: 'none' }}
          >
            <InlineAnnotationLabel kind="callout" id={callout.id} text={callout.text} />
          </Html>
        ) : null
      })}
    </>
  )
}
