import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import { createAsset, assetBytes, imageDimensions, MAX_ASSET_BYTES, safeAssetName } from '@assets'
import { validateDocumentAsset, type DocumentAsset } from '@core'
import { atomicWrite } from '@main/file-security/write'

export type AssetKind = 'image' | 'attachment' | 'audio'
export interface AssetPorts {
  showOpenDialog: (
    window: BrowserWindow,
    options: OpenDialogOptions,
  ) => Promise<OpenDialogReturnValue>
  showSaveDialog: (
    window: BrowserWindow,
    options: SaveDialogOptions,
  ) => Promise<SaveDialogReturnValue>
  decodeImage: (bytes: Buffer) => boolean
}

export const readSelectedAsset = async (
  path: string,
  kind: AssetKind,
  decodeImage: (bytes: Buffer) => boolean,
): Promise<DocumentAsset> => {
  const handle = await open(path, 'r')
  try {
    if ((await handle.stat()).size > MAX_ASSET_BYTES) throw new Error('单个资源不能超过 8 MiB')
    const chunks: Buffer[] = []
    let size = 0
    const stream = handle.createReadStream({ start: 0, end: MAX_ASSET_BYTES, autoClose: false })
    for await (const chunk of stream) {
      const bytes = chunk as Buffer
      size += bytes.length
      if (size > MAX_ASSET_BYTES) throw new Error('单个资源不能超过 8 MiB')
      chunks.push(bytes)
    }
    const bytes = Buffer.concat(chunks)
    const asset = createAsset(bytes, basename(path))
    if (kind === 'audio' && !asset.mimeType.startsWith('audio/'))
      throw new Error('请选择支持的音频文件')
    if (kind === 'image') {
      imageDimensions(asset)
      if (!decodeImage(bytes)) throw new Error('图片文件无法解码')
    }
    return asset
  } finally {
    await handle.close()
  }
}

export class AssetFiles {
  constructor(private readonly ports: AssetPorts) {}

  select = async (window: BrowserWindow, kind: AssetKind): Promise<DocumentAsset | null> => {
    const result = await this.ports.showOpenDialog(window, {
      title: kind === 'image' ? '添加主题图片' : kind === 'audio' ? '添加音频备注' : '添加主题附件',
      properties: ['openFile'],
      ...(kind === 'image'
        ? { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }
        : kind === 'audio'
          ? {
              filters: [
                { name: '音频', extensions: ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac'] },
              ],
            }
          : {}),
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : readSelectedAsset(path, kind, this.ports.decodeImage)
  }

  export = async (window: BrowserWindow, input: unknown): Promise<boolean> => {
    validateDocumentAsset(input)
    const bytes = assetBytes(input)
    const result = await this.ports.showSaveDialog(window, {
      title: '保存附件',
      defaultPath: safeAssetName(input.name),
    })
    if (result.canceled || !result.filePath) return false
    await atomicWrite(result.filePath, bytes)
    return true
  }
}
