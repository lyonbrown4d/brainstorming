import type { OpenedDocument } from '@shared/contracts'
import { deserializeWorkbook } from '@core'
import { requestPassword, setBrowserPassword, useFileSecurityState } from './password'

export async function unlockOpenedDocument(
  opened: OpenedDocument,
  title = '解锁思维导图',
): Promise<OpenedDocument | null> {
  const bridge = window.trelyx
  if (!opened.lockedToken || !bridge) return opened
  const token = opened.lockedToken
  let error: string | undefined
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const password = await requestPassword(title, undefined, error)
    if (password === null) {
      await bridge.cancelUnlock(token)
      return null
    }
    try {
      return await bridge.unlockDocument(token, password)
    } catch (failure) {
      error = failure instanceof Error ? failure.message : '解锁失败，请重试'
    }
  }
  await bridge.cancelUnlock(token)
  throw new Error('解锁尝试过多，请重新选择文件')
}
export async function activateOpenedDocument(opened: OpenedDocument): Promise<void> {
  const id = deserializeWorkbook(opened.contents).id
  if (window.trelyx) {
    const state = opened.sessionToken
      ? await window.trelyx.activateUnlockedDocument(opened.sessionToken)
      : await window.trelyx.setFilePassword(id, null)
    useFileSecurityState.setState({ documentId: id, encrypted: state.encrypted })
  } else if (!opened.encrypted) setBrowserPassword(id, null)
}
export async function cancelOpenedDocument(opened: OpenedDocument): Promise<void> {
  const token = opened.sessionToken ?? opened.lockedToken
  if (token) await window.trelyx?.cancelUnlock(token)
}
