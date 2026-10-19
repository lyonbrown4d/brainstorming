import type { CanvasStroke } from '@core/ink'
import { inkGeometry } from '@shared/ink-geometry'

/** One freehand geometry implementation serves live SVG and document exports. */
export const canvasStrokePath = (stroke: CanvasStroke): string => inkGeometry(stroke).path
