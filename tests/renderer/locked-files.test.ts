import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { activateOpenedDocument } from '@renderer/state/lockedFiles'
import { useFileSecurityState, resetFileSecurityState } from '@renderer/state/password'
import { desktop } from '@tests/fixtures/desktop'

const contents = serializeWorkbook(createWorkbook(createDocument('Protected revision')))
afterEach(() => {
  vi.unstubAllGlobals()
  resetFileSecurityState()
})
it('preserves the active key when accepting a decrypted revision from the same protected file', async () => {
  const setFilePassword = vi.fn(() => Promise.resolve({ encrypted: false }))
  const getFileSecurity = vi.fn(() => Promise.resolve({ encrypted: true }))
  vi.stubGlobal('window', {
    brainstorming: desktop({ setFilePassword, getFileSecurity }),
  })
  await activateOpenedDocument({ path: null, contents, encrypted: true })
  expect(setFilePassword).not.toHaveBeenCalled()
  expect(getFileSecurity).toHaveBeenCalledOnce()
  expect(useFileSecurityState.getState().encrypted).toBe(true)
})
it('rejects a protected snapshot when its main-process key is unavailable', async () => {
  const setFilePassword = vi.fn(() => Promise.resolve({ encrypted: false }))
  vi.stubGlobal('window', { brainstorming: desktop({ setFilePassword }) })
  await expect(activateOpenedDocument({ path: null, contents, encrypted: true })).rejects.toThrow()
  expect(setFilePassword).not.toHaveBeenCalled()
})
