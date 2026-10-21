import type { Command } from '@core'
import { measureTopic } from '@layout'
import { unprojectSpatialPoint } from '@renderer/lib/spatialCamera'
import type { SpatialView } from '@renderer/state/spatialView'

/** A pane click names the card's top-left corner; projection uses its center. */
export const spatialFloatingCommand = (
  id: string,
  title: string,
  position: { readonly x: number; readonly y: number },
  view: SpatialView,
): Command => {
  if (view.mode === '2d')
    return { type: 'addFloatingTopic', id, title, x: position.x, y: position.y }
  const { width, height } = measureTopic(title)
  const center = unprojectSpatialPoint(
    { x: position.x + width / 2, y: position.y + height / 2, z: 0 },
    view,
  )
  return {
    type: 'batch',
    commands: [
      {
        type: 'addFloatingTopic',
        id,
        title,
        x: center.x - width / 2,
        y: center.y - height / 2,
      },
      { type: 'setTopicStyle', topicId: id, style: { spatialDepth: center.z } },
    ],
  }
}
