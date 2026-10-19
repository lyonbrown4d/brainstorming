import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentTemplate } from '@shared/templates'
import { createDocument } from '@core'
import { queryClient } from '@renderer/lib/queryClient'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { beginCreation, cancelCreation, createFromRequest } from '@renderer/state/creation'
import { useWorkspace } from '@renderer/state/workspace'
import { desktop } from '@tests/fixtures/desktop'
import { fixtureTemplate } from '@tests/fixtures/templates'

const request = { title: 'Plan', layout: 'brace-left', template: 'brainstorm' } as const
beforeEach(() => {
  queryClient.clear()
  desktop()
  vi.stubGlobal('window', { confirm: () => true })
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.getState().replace(createDocument('Existing', 'existing'))
  useEditor.setState({ busy: false })
  useWorkspace.setState({ screen: 'editor', hasDocument: true })
})
afterEach(() => {
  queryClient.clear()
  vi.unstubAllGlobals()
})

const delayedTemplate = () => {
  let resolve: (template: ContentTemplate) => void = () => undefined
  const result = new Promise<ContentTemplate>((accept) => {
    resolve = accept
  })
  const getTemplate = vi.fn(() => result)
  desktop({ getTemplate })
  return {
    getTemplate,
    finish: () => {
      resolve(fixtureTemplate('brainstorm'))
    },
  }
}

describe('asynchronous template creation', () => {
  it('guards duplicate submits while waiting and commits the selected structure once', async () => {
    const delayed = delayedTemplate()
    beginCreation('document')
    const pending = createFromRequest(request)
    await expect(createFromRequest(request)).resolves.toBe(false)
    expect(delayed.getTemplate).toHaveBeenCalledTimes(1)
    expect(useEditor.getState().history.document.title).toBe('Existing')
    delayed.finish()
    await expect(pending).resolves.toBe(true)
    expect(useEditor.getState().history.document.title).toBe('Plan')
    expect(useEditor.getState().history.document.settings?.layout).toBe('brace-left')
    expect(useEditor.getState().history.past).toHaveLength(0)
  })

  it.each(['document', 'sheet'] as const)(
    'ignores a late %s response after leaving and returning to the guide',
    async (mode) => {
      const delayed = delayedTemplate()
      beginCreation(mode)
      const before = useEditor.getState().workbook
      const pending = createFromRequest(request)
      cancelCreation()
      beginCreation(mode)
      delayed.finish()
      await expect(pending).resolves.toBe(false)
      expect(useEditor.getState().workbook).toBe(before)
      expect(useWorkspace.getState().screen).toBe(
        mode === 'sheet' ? 'create-sheet' : 'create-document',
      )
    },
  )

  it.each(['workbook', 'sheet'] as const)(
    'ignores a late sheet response when the active %s changes',
    async (change) => {
      const delayed = delayedTemplate()
      const firstSheetId = useEditor.getState().activeSheetId
      if (change === 'sheet')
        useEditor.getState().addDocumentSheet(createDocument('Second', 'second'))
      beginCreation('sheet')
      const pending = createFromRequest(request)
      if (change === 'workbook') useEditor.getState().replace(createDocument('Other', 'other'))
      else useEditor.getState().switchSheet(firstSheetId)
      const current = useEditor.getState().workbook
      delayed.finish()
      await expect(pending).resolves.toBe(false)
      expect(useEditor.getState().workbook).toBe(current)
      expect(current.sheets).toHaveLength(change === 'sheet' ? 2 : 1)
    },
  )

  it('keeps the draft after a failed read and still permits blank creation', async () => {
    desktop({ getTemplate: () => Promise.reject(new Error('Template unavailable')) })
    beginCreation('document')
    const before = useEditor.getState().workbook
    await expect(createFromRequest(request)).resolves.toBe(false)
    expect(useEditor.getState().error).toBe('Template unavailable')
    expect(useEditor.getState().workbook).toBe(before)
    expect(useWorkspace.getState().screen).toBe('create-document')
    await expect(createFromRequest({ ...request, template: 'blank' })).resolves.toBe(true)
    expect(Object.keys(useEditor.getState().history.document.topics)).toEqual(['root'])
  })
})
