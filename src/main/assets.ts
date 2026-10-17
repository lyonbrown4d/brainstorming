import type { IPCRegistry, TrustedWindow } from '@main/application/ipcRegistry'
import type { AssetFiles } from '@main/system/assets'

export const registerAssetIPC = (
  ipc: IPCRegistry,
  trusted: TrustedWindow,
  assets: AssetFiles,
): void => {
  ipc.handle('asset:select', (event, kind: unknown) => {
    const window = trusted(event)
    if (kind !== 'image' && kind !== 'attachment' && kind !== 'audio')
      throw new Error('资源类型无效')
    return assets.select(window, kind)
  })
  ipc.handle('asset:export', (event, input: unknown) => assets.export(trusted(event), input))
}
