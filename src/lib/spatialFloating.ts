import type { Command } from '@core'

/** Shared pane placement belongs to the 2D canvas; Three resolves its world plane separately. */
export const spatialFloatingCommand = (
  id: string,
  title: string,
  position: { readonly x: number; readonly y: number },
): Command => ({ type: 'addFloatingTopic', id, title, x: position.x, y: position.y })
