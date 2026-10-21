import { afterEach, expect, it } from 'vitest'
import { useEditor } from '@renderer/state/editor'
import { getSpatialViewport, setSpatialViewport } from '@renderer/state/spatialViewports'

const originalViews = useEditor.getState().views
afterEach(() => {
  useEditor.setState({ views: originalViews })
})

it('retains separate mode viewports after the canvas unmounts and preserves the 2D editor slot', () => {
  const { workbook, activeSheetId } = useEditor.getState()
  const twoD = { x: 120, y: -40, zoom: 1.2 }
  const threeD = { x: -900, y: 180, zoom: 0.6 }
  setSpatialViewport(workbook.id, activeSheetId, '2d', twoD)
  setSpatialViewport(workbook.id, activeSheetId, '3d', threeD)
  expect(getSpatialViewport(workbook.id, activeSheetId, '2d')).toEqual(twoD)
  expect(getSpatialViewport(workbook.id, activeSheetId, '3d')).toEqual(threeD)
  expect(useEditor.getState().views[activeSheetId]).toEqual(twoD)
  expect(getSpatialViewport('other-workbook', activeSheetId, '3d')).toBeUndefined()

  const legacySheet = 'legacy-sheet-without-spatial-viewport'
  const legacy = { x: 4, y: 8, zoom: 0.8 }
  useEditor.setState((state) => ({ views: { ...state.views, [legacySheet]: legacy } }))
  expect(getSpatialViewport(workbook.id, legacySheet, '2d')).toEqual(legacy)
})
