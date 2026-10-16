import { serializeWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'
import { requestPassword, setBrowserPassword } from './password'

async function decodeBrowserFile(file: File): Promise<OpenedDocument | null> {
  if (file.size > 32 * 1024 * 1024) throw new Error('文件超过 32 MiB，无法打开')
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Native archives are identified by their manifest, including extensionless browser downloads.
  // XMind keeps its explicit import route and must never become a writable native document.
  if (!file.name.toLowerCase().endsWith('.xmind')) {
    const { isEncryptedTrelyx, decryptTrelyx } = await import('../../../formats/encrypted')
    if (await isEncryptedTrelyx(bytes)) {
      let error: string | undefined
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const password = await requestPassword('解锁思维导图', undefined, error)
        if (password === null) return null
        try {
          const workbook = await decryptTrelyx(bytes, password)
          // Caller adopts this key only once it accepts the opened workbook.
          pendingBrowserPassword = { documentId: workbook.id, password }
          return {
            path: file.name,
            sourcePath: file.name,
            contents: serializeWorkbook(workbook),
            encrypted: true,
            warnings: [],
          }
        } catch (failure) {
          error = failure instanceof Error ? failure.message : '解锁失败'
        }
      }
      throw new Error('解锁尝试过多，请重新选择文件')
    }
  }
  const { decodeFile } = await import('../../../formats')
  const result = decodeFile(bytes, file.name)
  return {
    path: result.imported ? null : file.name,
    sourcePath: file.name,
    contents: serializeWorkbook(result.workbook),
    warnings: result.warnings,
  }
}
let pendingBrowserPassword: { documentId: string; password: string } | null = null
export function adoptBrowserPassword(documentId: string): void {
  if (pendingBrowserPassword?.documentId === documentId)
    setBrowserPassword(documentId, pendingBrowserPassword.password, true)
  pendingBrowserPassword = null
}
export function cancelBrowserPassword(): void {
  pendingBrowserPassword = null
}
export function browserOpen(): Promise<OpenedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.trelyx,.xmind'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      void decodeBrowserFile(file).then(resolve, reject)
    }
    input.oncancel = () => {
      resolve(null)
    }
    input.click()
  })
}
