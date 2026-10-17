import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, deserializeWorkbook, serializeWorkbook } from '@core'
import type { SaveRequest } from '@shared/contracts'
import { desktop } from '@tests/fixtures/desktop'
import { isDirty, useEditor } from '@renderer/state/editor'
import {
  closeDocumentTab,
  openDocumentTab,
  switchDocumentTab,
  synchronizeDocumentTab,
  useDocumentTabs,
} from '@renderer/state/documentTabs'
import { startDocumentAutosave } from '@renderer/state/documentAutosave'
import { queueDocumentWrite } from '@renderer/lib/documentWriteQueue'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { changeFilePassword, restoreBackup } from '@renderer/state/fileSecurityActions'
import { resetFileSecurityState, useFileSecurityState } from '@renderer/state/password'
import { saveDocument } from '@renderer/state/files'
import { useWorkspace } from '@renderer/state/workspace'

let stop: (() => void) | undefined
const requests: SaveRequest[] = []
const finishes: ((path: string | null) => void)[] = []
const rename = (title: string): void => {
  useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title })
}
const title = (index: number): string | undefined => {
  const request = requests[index]
  return request ? deserializeWorkbook(request.contents).sheets[0]?.document.title : undefined
}
const activeId = (): string => {
  const id = useDocumentTabs.getState().activeId
  if (!id) throw new Error('Missing tab')
  return id
}
beforeEach(() => {
  vi.useFakeTimers()
  resetFileSecurityState()
  requests.length = 0
  finishes.length = 0
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  vi.stubGlobal('window', { confirm: vi.fn(() => true) })
  desktop({
    saveDocument: (request) => {
      requests.push(request)
      return new Promise((resolve) => finishes.push(resolve))
    },
  })
  openDocumentTab(createDocument('Alpha', 'alpha'), '/alpha.brainstorming')
  stop = startDocumentAutosave()
})
afterEach(async () => {
  stop?.()
  for (const [index, finish] of finishes.entries()) finish(requests[index]?.path ?? null)
  await vi.advanceTimersByTimeAsync(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('saves other tabs while a path is in flight and preserves newer edits and the active baseline', async () => {
  const alpha = activeId()
  rename('Alpha first')
  await vi.advanceTimersByTimeAsync(700)
  rename('Alpha newer')
  openDocumentTab(createDocument('Beta', 'beta'), '/beta.brainstorming')
  rename('Beta changed')
  const betaBaseline = useEditor.getState().baseline
  await vi.advanceTimersByTimeAsync(700)
  expect(requests.map((request) => request.path)).toEqual([
    '/alpha.brainstorming',
    '/beta.brainstorming',
  ])
  finishes[0]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(useEditor.getState().baseline).toBe(betaBaseline)
  expect(useEditor.getState().path).toBe('/beta.brainstorming')
  expect(title(2)).toBe('Alpha newer')
  expect(useDocumentTabs.getState().tabs.find((tab) => tab.id === alpha)?.editor.baseline).toBe(
    requests[0]?.contents,
  )
  finishes[1]?.('/beta.brainstorming')
  finishes[2]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
  switchDocumentTab(alpha)
  expect(useEditor.getState().history.document.title).toBe('Alpha newer')
  expect(useEditor.getState().baseline).toBe(requests[2]?.contents)
  expect(isDirty()).toBe(false)
})

it('serializes manual Save after autosave and persists edits made during the manual write', async () => {
  const alpha = activeId()
  openDocumentTab(createDocument('Beta', 'beta'), '/beta.brainstorming')
  switchDocumentTab(alpha)
  rename('Automatic first')
  await vi.advanceTimersByTimeAsync(700)
  rename('Manual snapshot')
  const saving = saveDocument()
  expect(requests).toHaveLength(1)
  finishes[0]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(requests).toHaveLength(2)
  expect(title(1)).toBe('Manual snapshot')
  expect(requests[1]?.openDocumentIds).toEqual(['alpha', 'beta'])
  rename('Edited during save')
  finishes[1]?.('/alpha.brainstorming')
  await saving
  expect(useEditor.getState().baseline).toBe(requests[1]?.contents)
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(700)
  expect(title(2)).toBe('Edited during save')
  finishes[2]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
})

it('waits before Save As and sends subsequent autosaves only to the newly selected path', async () => {
  rename('Before Save As')
  await vi.advanceTimersByTimeAsync(700)
  rename('Save As snapshot')
  const saving = saveDocument(true)
  expect(requests).toHaveLength(1)
  finishes[0]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(requests[1]?.path).toBeNull()
  expect(title(1)).toBe('Save As snapshot')
  finishes[1]?.('/copy.brainstorming')
  await saving
  synchronizeDocumentTab()
  rename('At new path')
  await vi.advanceTimersByTimeAsync(700)
  expect(requests.map((request) => request.path)).toEqual([
    '/alpha.brainstorming',
    null,
    '/copy.brainstorming',
  ])
  finishes[2]?.('/copy.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
})

it('cancels pending work on close, waits before native release and never recreates the closed tab', async () => {
  const id = activeId()
  rename('In flight')
  await vi.advanceTimersByTimeAsync(700)
  rename('Never write this closed tab')
  expect(closeDocumentTab(id)).toBe(true)
  const release = vi.fn(() => Promise.resolve())
  const releasing = queueDocumentWrite('/alpha.brainstorming', release)
  expect(release).not.toHaveBeenCalled()
  finishes[0]?.('/alpha.brainstorming')
  await releasing
  await vi.advanceTimersByTimeAsync(5000)
  expect(release).toHaveBeenCalledOnce()
  expect(requests).toHaveLength(1)
  expect(useDocumentTabs.getState().tabs).toEqual([])
  expect(useDocumentTabs.getState().activeId).toBeNull()
  expect(useWorkspace.getState().hasDocument).toBe(false)
})

it('waits for autosave before changing the file password and then saves with the new session', async () => {
  const password = vi.fn(() => Promise.resolve({ encrypted: true }))
  desktop({ ...requireDesktopAPI(), setFilePassword: password })
  rename('Before password change')
  await vi.advanceTimersByTimeAsync(700)
  const changing = changeFilePassword('new-password')
  expect(password).not.toHaveBeenCalled()
  expect(useEditor.getState().busy).toBe(true)
  finishes[0]?.('/alpha.brainstorming')
  await changing
  expect(password).toHaveBeenCalledWith('alpha', 'new-password')
  expect(useFileSecurityState.getState()).toMatchObject({ documentId: 'alpha', encrypted: true })
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(700)
  expect(title(1)).toBe('Before password change')
  finishes[1]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
})

it('waits for autosave before reading a backup and subsequently persists the restored snapshot', async () => {
  const restored = serializeWorkbook(createWorkbook(createDocument('Archived', 'alpha')))
  const read = vi.fn(() => Promise.resolve({ path: null, contents: restored }))
  desktop({ ...requireDesktopAPI(), restoreDocumentBackup: read })
  rename('Before restoring')
  await vi.advanceTimersByTimeAsync(700)
  const restoring = restoreBackup('version-id')
  expect(read).not.toHaveBeenCalled()
  finishes[0]?.('/alpha.brainstorming')
  await restoring
  expect(read).toHaveBeenCalledWith('version-id')
  expect(useEditor.getState().history.document.title).toBe('Archived')
  expect(isDirty()).toBe(true)
  await vi.advanceTimersByTimeAsync(700)
  expect(title(1)).toBe('Archived')
  finishes[1]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
})

it('ignores a password completion after an external document replacement', async () => {
  let finish: ((security: { encrypted: boolean }) => void) | undefined
  desktop({
    ...requireDesktopAPI(),
    setFilePassword: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  const changing = changeFilePassword('new-password')
  useEditor.getState().replace(createDocument('Other document', 'other'), '/other.brainstorming')
  const baseline = useEditor.getState().baseline
  finish?.({ encrypted: true })
  await changing
  expect(useEditor.getState().path).toBe('/other.brainstorming')
  expect(useEditor.getState().baseline).toBe(baseline)
  expect(useFileSecurityState.getState().documentId).not.toBe('alpha')
  expect(isDirty()).toBe(false)
})

it('ignores a backup read after an external document replacement', async () => {
  const contents = serializeWorkbook(createWorkbook(createDocument('Archived', 'alpha')))
  let finish: ((opened: { path: null; contents: string }) => void) | undefined
  desktop({
    ...requireDesktopAPI(),
    restoreDocumentBackup: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  const restoring = restoreBackup('version-id')
  useEditor.getState().replace(createDocument('Other document', 'other'), '/other.brainstorming')
  const baseline = useEditor.getState().baseline
  finish?.({ path: null, contents })
  await restoring
  expect(useEditor.getState().history.document.title).toBe('Other document')
  expect(useEditor.getState().path).toBe('/other.brainstorming')
  expect(useEditor.getState().baseline).toBe(baseline)
  expect(isDirty()).toBe(false)
})

it('reads live ownership when a queued autosave reaches native, excluding a closed tab', async () => {
  rename('First snapshot')
  await vi.advanceTimersByTimeAsync(700)
  expect(requests[0]?.openDocumentIds).toEqual(['alpha'])
  const alpha = activeId()
  openDocumentTab(createDocument('Beta', 'beta'), '/beta.brainstorming')
  const beta = activeId()
  switchDocumentTab(alpha)
  rename('Queued snapshot')
  await vi.advanceTimersByTimeAsync(700)
  expect(requests).toHaveLength(1)
  expect(closeDocumentTab(beta)).toBe(true)
  finishes[0]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(title(1)).toBe('Queued snapshot')
  expect(requests[1]?.openDocumentIds).toEqual(['alpha'])
  finishes[1]?.('/alpha.brainstorming')
  await vi.advanceTimersByTimeAsync(0)
  expect(isDirty()).toBe(false)
})
