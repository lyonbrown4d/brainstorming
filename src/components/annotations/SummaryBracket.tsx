import type { MindMapDocument } from '@core'
import type { TopicGroup } from '@core/extensions'
import type { LayoutNode } from '@layout'
import { groupBounds } from '@renderer/components/annotations/projection'
import { InlineAnnotationLabel } from '@renderer/components/annotations/InlineAnnotationLabel'
import { useSummaryScopeDrag } from '@renderer/components/annotations/useSummaryScopeDrag'
import { useMessages } from '@renderer/i18n/useMessages'

export const SummaryBracket = ({
  document,
  group,
  nodes,
}: {
  document: MindMapDocument
  group: TopicGroup
  nodes: readonly LayoutNode[]
}) => {
  const { translate } = useMessages()
  const scope = useSummaryScopeDrag(document, group, nodes)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visible = scope.previewIds.flatMap((id) => {
    const node = byId.get(id)
    return node ? [node] : []
  })
  const bounds = groupBounds(visible)
  if (bounds === null) return null
  const left = visible.every(({ side }) => side === 'left')
  const color = group.color ?? '#8b79d9'
  const x = left ? bounds.x : bounds.x + bounds.width
  const handle = (edge: 'start' | 'end') => (
    <button
      type="button"
      aria-label={translate(edge === 'start' ? 'summaryStartHandle' : 'summaryEndHandle')}
      title={translate('summaryRangeHint')}
      className="nodrag nopan pointer-events-auto absolute -left-2 size-4 cursor-ns-resize rounded-full border-2 border-background bg-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:hidden"
      style={{ top: edge === 'start' ? -8 : bounds.height - 8 }}
      disabled={!scope.valid}
      onPointerDown={(event) => {
        scope.onPointerDown(event, edge)
      }}
      onPointerMove={scope.onPointerMove}
      onPointerUp={scope.onPointerUp}
      onPointerCancel={scope.onPointerCancel}
    />
  )
  return (
    <div
      className="pointer-events-none absolute border-l-2"
      data-summary-id={group.id}
      data-summary-members={scope.previewIds.join(',')}
      style={{ left: x, top: bounds.y, height: bounds.height, borderColor: color }}
    >
      <div className="absolute -left-2 top-0 w-2 border-t-2" style={{ borderColor: color }} />
      <div className="absolute -left-2 bottom-0 w-2 border-b-2" style={{ borderColor: color }} />
      {handle('start')}
      {handle('end')}
      {group.summaryTopicId === undefined ? (
        <div className={`absolute -top-5 ${left ? 'right-full mr-2' : 'left-full ml-2'}`}>
          <InlineAnnotationLabel
            kind="group"
            id={group.id}
            text={group.title?.trim() ? group.title : translate('summary')}
            color={group.color}
          />
        </div>
      ) : null}
    </div>
  )
}
