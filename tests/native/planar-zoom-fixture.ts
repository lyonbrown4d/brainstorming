import { createFixtureDocument, createWorkbook, serializeWorkbook } from '@core'
import { browser, expect } from '@wdio/globals'
import { artifact, chooseFile, home, native, openSaved } from '@tests/native/driver'

export const openPlanarZoomFixture = async (): Promise<void> => {
  await home()
  const document = { ...createFixtureDocument(40), id: artifact('planar-zoom') }
  const name = artifact('planar-zoom')
  const path = await chooseFile('save', name)
  await native('saveDocument', {
    request: {
      path: null,
      contents: serializeWorkbook(createWorkbook(document)),
      suggestedName: name,
    },
  })
  await native('releaseDocument', { path })
  await openSaved(name)
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await expect(browser.$('[data-view-mode="2d"]')).toBeDisplayed()
}
