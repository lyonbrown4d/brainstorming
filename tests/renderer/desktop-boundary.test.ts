import { useDocumentTabs } from '@renderer/state/documentTabs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, type DocumentAsset } from '@core'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { importTopicAssets, exportTopicAsset } from '@renderer/state/assets'
import { useEditor } from '@renderer/state/editor'
import { changeFilePassword, readRecoveryContents } from '@renderer/state/fileSecurityActions'
import { openDocument, saveDocument } from '@renderer/state/files'
import { openHistoryDialog, useFileDialogs } from '@renderer/state/fileDialogs'
import { resetFileSecurityState, useFileSecurityState } from '@renderer/state/password'
import { desktop } from '@tests/fixtures/desktop'

const asset: DocumentAsset = {
  id: 'attachment',
  name: '说明.txt',
  mimeType: 'application/octet-stream',
  data: 'YWJj',
}
const createElement = vi.fn()
beforeEach(() => {
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  createElement.mockReset()
  vi.stubGlobal('window', { confirm: () => true })
  vi.stubGlobal('document', { createElement })
  useEditor.getState().replace(createDocument('Current', 'current'), '/current.brainstorming')
  useEditor.setState({ busy: false, recovery: null })
  resetFileSecurityState()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktop capability boundary', () => {
  it('requires initialized native capabilities and preserves the unsaved workbook on open/save failure', async () => {
    expect(() => requireDesktopAPI()).toThrow('原生平台')
    useEditor.getState().command({ type: 'renameTopic', topicId: 'root', title: 'Unsaved' })
    const before = useEditor.getState()
    await openDocument()
    expect(useEditor.getState().workbook).toBe(before.workbook)
    expect(useEditor.getState().error).toContain('原生平台')
    await saveDocument()
    expect(useEditor.getState().baseline).toBe(before.baseline)
    expect(useEditor.getState().path).toBe('/current.brainstorming')
    expect(useEditor.getState().busy).toBe(false)
    expect(useEditor.getState().error).toContain('原生平台')
    expect(createElement).not.toHaveBeenCalled()
  })

  it('fails recovery, password and history operations explicitly without local storage substitutes', async () => {
    const baseline = useEditor.getState().baseline
    await expect(readRecoveryContents()).rejects.toThrow('原生平台')
    await expect(changeFilePassword('native-password-123')).rejects.toThrow('原生平台')
    expect(useFileSecurityState.getState().encrypted).toBe(false)
    expect(useEditor.getState().baseline).toBe(baseline)
    expect(useEditor.getState().busy).toBe(false)
    await openHistoryDialog()
    expect(useFileDialogs.getState().historyError).toContain('原生平台')
    expect(useFileDialogs.getState().backups).toEqual([])
  })

  it('does not open file inputs or download links when native asset capabilities are absent', async () => {
    const history = useEditor.getState().history
    await importTopicAssets('root', 'attachment')
    expect(useEditor.getState().history).toBe(history)
    expect(useEditor.getState().error).toContain('原生平台')
    await exportTopicAsset(asset)
    expect(useEditor.getState().error).toContain('原生平台')
    expect(useEditor.getState().busy).toBe(false)
    expect(createElement).not.toHaveBeenCalled()
  })

  it('uses the native picker and exporter while keeping cancellation and failure out of history', async () => {
    const selectAsset = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(asset)
    const exportAsset = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('window', { brainstorming: desktop({ selectAsset, exportAsset }) })
    const history = useEditor.getState().history
    await importTopicAssets('root', 'attachment')
    expect(useEditor.getState().history).toBe(history)
    await importTopicAssets('root', 'attachment')
    expect(useEditor.getState().history.document.topics.root?.attachments).toEqual([asset.id])
    expect(useEditor.getState().history.past).toHaveLength(1)
    await exportTopicAsset(asset)
    expect(exportAsset).toHaveBeenCalledWith(asset)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.topics.root?.attachments).toBeUndefined()
    selectAsset.mockRejectedValueOnce(new Error('原生选择失败'))
    const beforeFailure = useEditor.getState().history
    await importTopicAssets('root', 'attachment')
    expect(useEditor.getState().history).toBe(beforeFailure)
    expect(useEditor.getState().error).toBe('原生选择失败')
    expect(useEditor.getState().busy).toBe(false)
    expect(createElement).not.toHaveBeenCalled()
  })
})
