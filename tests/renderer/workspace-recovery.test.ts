import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, deserializeWorkbook, serializeWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import {
  restoreWorkspaceRecovery,
  workspaceRecoveryContents,
} from '@renderer/state/documentRecovery'
import { useWorkspace } from '@renderer/state/workspace'
import { answerPassword, resetFileSecurityState, usePasswordPrompt } from '@renderer/state/password'
import { desktop } from '@tests/fixtures/desktop'

const workbook = (id: string) => createWorkbook(createDocument(`Document ${id}`, id))
const record = (id: string): OpenedDocument => ({
  path: null,
  contents: serializeWorkbook(workbook(id)),
  recoveryId: id,
})

beforeEach(() => {
  vi.stubGlobal('window', { brainstorming: desktop(), confirm: vi.fn(() => true) })
  useEditor.setState(useEditor.getInitialState(), true)
  useWorkspace.setState(useWorkspace.getInitialState(), true)
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  resetFileSecurityState()
})
afterEach(() => {
  answerPassword(null)
  resetFileSecurityState()
  vi.unstubAllGlobals()
})

describe('workspace recovery coordination', () => {
  it('serializes every workbook with the active draft, excluding paths and sessions without mutating history', () => {
    openDocumentTab(workbook('alpha'), '/private/alpha.brainstorming')
    useEditor
      .getState()
      .command({ type: 'setTopicNotes', topicId: 'root', notes: 'Saved Alpha notes' })
    openDocumentTab(workbook('beta'), '/private/beta.brainstorming')
    useEditor.setState({ views: { beta: { x: 19, y: 23, zoom: 2 } } })
    useEditor.getState().startEdit('root', undefined, 'notes')
    useEditor.getState().setDraft('Uncommitted Beta notes')
    const before = useEditor.getState()
    const contents = workspaceRecoveryContents()
    const recovered = contents.map(deserializeWorkbook)
    expect(recovered.map((entry) => entry.id)).toEqual(['alpha', 'beta'])
    expect(recovered[0]?.sheets[0]?.document.topics.root?.notes).toBe('Saved Alpha notes')
    expect(recovered[1]?.sheets[0]?.document.topics.root?.notes).toBe('Uncommitted Beta notes')
    for (const entry of recovered)
      expect(Object.keys(entry).sort()).toEqual(['format', 'id', 'sheets', 'title', 'version'])
    expect(contents.join('\n')).not.toContain('/private/')
    expect(contents.join('\n')).not.toContain('"history"')
    expect(contents.join('\n')).not.toContain('"views"')
    expect(useEditor.getState().history).toBe(before.history)
    expect(useEditor.getState().workbook).toBe(before.workbook)
    expect(useEditor.getState().editingId).toBe('root')
    expect(useEditor.getState().draft).toBe('Uncommitted Beta notes')
    expect(useEditor.getState().history.document.topics.root?.notes).toBeUndefined()
  })

  it('keeps unprocessed records after unlock cancellation, then retries without duplicating or replacing restored tabs', async () => {
    const first = record('alpha')
    const locked: OpenedDocument = {
      path: null,
      contents: '',
      lockedToken: 'beta-locked',
      recoveryId: 'beta',
    }
    const last = record('gamma')
    const records = [first, locked, last]
    const reread = vi
      .fn<() => Promise<readonly OpenedDocument[]>>()
      .mockResolvedValueOnce(records)
      .mockResolvedValue([first, { ...locked, lockedToken: 'beta-retry' }, last])
    const cancelUnlock = vi.fn(() => Promise.resolve())
    const unlockDocument = vi.fn(() =>
      Promise.resolve({ ...record('beta'), sessionToken: 'beta-session' }),
    )
    window.brainstorming = desktop({
      readWorkspaceRecovery: reread,
      cancelUnlock,
      unlockDocument,
    })
    useDocumentTabs.setState({ recovery: records })
    const restoring = restoreWorkspaceRecovery()
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request).not.toBeNull()
    })
    expect(useDocumentTabs.getState().tabs.map((tab) => tab.editor.workbook.id)).toEqual(['alpha'])
    answerPassword(null)
    await restoring
    expect(useEditor.getState().busy).toBe(false)
    expect(useEditor.getState().history.document.title).toBe('Document alpha')
    expect(useDocumentTabs.getState().recovery).toEqual([locked, last])
    expect(cancelUnlock).toHaveBeenCalledWith('beta-locked')
    useEditor
      .getState()
      .command({ type: 'renameTopic', topicId: 'root', title: 'Keep newly edited Alpha' })
    const retrying = restoreWorkspaceRecovery()
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request).not.toBeNull()
    })
    answerPassword('correct-password')
    await retrying
    expect(useDocumentTabs.getState().tabs.map((tab) => tab.editor.workbook.id)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
    expect(useDocumentTabs.getState().tabs[0]?.editor.history.document.title).toBe(
      'Keep newly edited Alpha',
    )
    expect(useDocumentTabs.getState().recovery).toEqual([])
    expect(useEditor.getState().busy).toBe(false)
    expect(unlockDocument).toHaveBeenCalledWith('beta-retry', 'correct-password')
    expect(reread).toHaveBeenCalledTimes(2)
  })
})
