import { expect, it } from 'vitest'
import { resumeIndependentSpatialCameraSession } from '@renderer/lib/independentSpatialCameraHandoff'
import type { SpatialCameraSession } from '@renderer/state/spatialNavigation'

it('hands physically finished orbit input to wheel or a new pointer before damping finishes', () => {
  const before: SpatialCameraSession = {
    workbookId: 'book',
    sheetId: 'sheet',
    document: {},
    original: { mode: '3d', yaw: 0, pitch: 0, spacing: 80 },
    distance: 500,
    pointerId: 7,
    ended: true,
    wheelCommit: false,
  }
  const wheel = resumeIndependentSpatialCameraSession(before, null)
  expect(wheel).toMatchObject({ pointerId: null, ended: false, wheelCommit: true })
  expect(wheel?.document).toBe(before.document)
  expect(wheel?.original).toBe(before.original)
  expect(resumeIndependentSpatialCameraSession(before, 9)).toMatchObject({
    pointerId: 9,
    ended: false,
  })
  expect(before).toMatchObject({ pointerId: 7, ended: true })
  expect(resumeIndependentSpatialCameraSession({ ...before, ended: false }, null)).toBeNull()
})
