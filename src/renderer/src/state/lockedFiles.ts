import { translate } from '@renderer/i18n'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import type { OpenedDocument } from '@shared/contracts'
import { deserializeWorkbook } from '@core'
import { requestPassword, useFileSecurityState } from '@renderer/state/password'

export const unlockOpenedDocument = async (
  opened: OpenedDocument,
  title = translate('unlockMindMap'),
): Promise<OpenedDocument | null> => {
  const bridge = requireDesktopAPI()
  if (!opened.lockedToken) return opened
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
      error = failure instanceof Error ? failure.message : translate('unlockFailedPleaseRetry')
    }
  }
  await bridge.cancelUnlock(token)
  throw new Error(translate('tooManyUnlockAttemptsSelectTheFile'))
}
export const activateOpenedDocument = async (opened: OpenedDocument): Promise<void> => {
  const id = deserializeWorkbook(opened.contents).id
  const bridge = requireDesktopAPI()
  const state = opened.sessionToken
    ? await bridge.activateUnlockedDocument(opened.sessionToken)
    : await bridge.setFilePassword(id, null)
  useFileSecurityState.setState({ documentId: id, encrypted: state.encrypted })
}
export const cancelOpenedDocument = async (opened: OpenedDocument): Promise<void> => {
  const token = opened.sessionToken ?? opened.lockedToken
  if (token) await requireDesktopAPI().cancelUnlock(token)
}
