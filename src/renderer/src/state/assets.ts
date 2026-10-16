import { applyCommand, type DocumentAsset } from '@core'
import { useEditor } from './editor'

async function selectBrowserAsset(
  kind: 'image' | 'attachment' | 'audio',
): Promise<DocumentAsset | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (kind === 'image') input.accept = '.png,.jpg,.jpeg,.gif,.webp'
    if (kind === 'audio') input.accept = '.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac'
    input.onchange = () => {
      resolve(input.files?.[0] ?? null)
    }
    input.oncancel = () => {
      resolve(null)
    }
    input.click()
  })
  if (!file) return null
  if (file.size > 8 * 1024 * 1024) throw new Error('单个资源不能超过 8 MiB')
  const [buffer, { createAsset, imageDimensions }] = await Promise.all([
    file.arrayBuffer(),
    import('../../../assets'),
  ])
  const asset = createAsset(new Uint8Array(buffer), file.name)
  if (kind === 'audio' && !asset.mimeType.startsWith('audio/'))
    throw new Error('请选择支持的音频文件')
  if (kind === 'image') {
    imageDimensions(asset)
    const bitmap = await createImageBitmap(new Blob([buffer]))
    bitmap.close()
  }
  return asset
}

export async function importTopicAssets(
  topicId: string,
  kind: 'image' | 'attachment' | 'audio',
): Promise<void> {
  const state = useEditor.getState()
  if (state.busy) return
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const workbookId = state.workbook.id
  const sheetId = state.activeSheetId
  useEditor.setState({ busy: true, error: null })
  try {
    const asset = window.trelyx
      ? await window.trelyx.selectAsset(kind)
      : await selectBrowserAsset(kind)
    if (!asset) return
    const [{ encodeTrelyx }, { imageDimensions }] = await Promise.all([
      import('../../../formats/trelyx'),
      import('../../../assets'),
    ])
    const current = useEditor.getState()
    if (
      current.workbook.id !== workbookId ||
      current.activeSheetId !== sheetId ||
      !current.history.document.topics[topicId]
    )
      throw new Error('主题已切换或删除，请重新添加资源')
    const command =
      kind === 'image'
        ? { type: 'setTopicImage' as const, topicId, asset, ...imageDimensions(asset) }
        : kind === 'audio'
          ? { type: 'setTopicAudio' as const, topicId, asset }
          : { type: 'addTopicAttachment' as const, topicId, asset }
    const candidate = applyCommand(current.history.document, command)
    // A successful insert must remain representable by the native writer.
    encodeTrelyx({
      ...current.workbook,
      sheets: current.workbook.sheets.map((sheet) =>
        sheet.id === sheetId ? { ...sheet, document: candidate } : sheet,
      ),
    })
    current.command(command)
  } catch (error) {
    useEditor.getState().setError(error instanceof Error ? error.message : '资源添加失败')
  } finally {
    useEditor.setState({ busy: false })
  }
}

export async function exportTopicAsset(asset: DocumentAsset): Promise<void> {
  if (useEditor.getState().busy) return
  useEditor.setState({ busy: true, error: null })
  try {
    if (window.trelyx) await window.trelyx.exportAsset(asset)
    else {
      const { assetBytes, safeAssetName } = await import('../../../assets')
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(assetBytes(asset)).buffer], { type: asset.mimeType }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = safeAssetName(asset.name)
      link.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    }
  } catch (error) {
    useEditor.getState().setError(error instanceof Error ? error.message : '附件保存失败')
  } finally {
    useEditor.setState({ busy: false })
  }
}
