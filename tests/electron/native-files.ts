import { expect, type Page } from '@playwright/test'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { nativeSession } from '@tests/electron/session'
import { nativeRecoveryBytes } from '@tests/electron/recovery'

type FileInput = string | { name: string; mimeType: string; buffer: Buffer }

/** Stub only the operating system dialog; the real main process reads the resulting disk file. */
export const prepareNativeOpen = async (page: Page) => {
  const { app, directory } = nativeSession(page)
  await app.evaluate(({ dialog }) => {
    const state = globalThis as typeof globalThis & {
      brainstormingOpenSelection?: (result: Electron.OpenDialogReturnValue) => void
    }
    dialog.showOpenDialog = () =>
      new Promise((resolve) => {
        state.brainstormingOpenSelection = resolve
      })
  })
  return {
    selectFile: async (input: FileInput | []): Promise<string | null> => {
      let path: string | undefined
      if (typeof input === 'string') path = input
      else if (!Array.isArray(input)) {
        const folder = join(directory, 'inputs', randomUUID())
        await mkdir(folder, { recursive: true })
        path = join(folder, basename(input.name))
        await writeFile(path, input.buffer)
      }
      await expect
        .poll(() => app.evaluate(() => 'brainstormingOpenSelection' in globalThis))
        .toBe(true)
      await app.evaluate((_, selected) => {
        const state = globalThis as typeof globalThis & {
          brainstormingOpenSelection?: (result: Electron.OpenDialogReturnValue) => void
        }
        const resolve = state.brainstormingOpenSelection
        delete state.brainstormingOpenSelection
        resolve?.({ canceled: !selected, filePaths: selected ? [selected] : [] })
      }, path ?? null)
      return path ?? null
    },
  }
}

/** Native writes may reuse the existing path; watch disk bytes as well as the save dialog. */
export const prepareNativeSave = async (page: Page) => {
  const { app, directory } = nativeSession(page)
  const folder = join(directory, 'outputs', randomUUID())
  await mkdir(folder, { recursive: true })
  const existingPath = await page.evaluate(() =>
    document.querySelector('.save-status')?.getAttribute('title'),
  )
  const before = existingPath
    ? await stat(existingPath)
        .then((file) => file.mtimeMs)
        .catch(() => null)
    : null
  await app.evaluate(({ dialog }, outputDirectory) => {
    const state = globalThis as typeof globalThis & { brainstormingSavedPath?: string }
    delete state.brainstormingSavedPath
    dialog.showSaveDialog = (
      ...args: [Electron.SaveDialogOptions] | [Electron.BaseWindow, Electron.SaveDialogOptions]
    ) => {
      const options = args.length === 2 ? args[1] : args[0]
      const name = options.defaultPath?.split(/[\\/]/u).at(-1) ?? 'document.brainstorming'
      const path = `${outputDirectory}/${name}`
      state.brainstormingSavedPath = path
      return Promise.resolve({ canceled: false, filePath: path })
    }
  }, folder)
  return {
    path: async (): Promise<string> => {
      let result = ''
      await expect
        .poll(async () => {
          const selected = await app.evaluate(
            () =>
              (globalThis as typeof globalThis & { brainstormingSavedPath?: string })
                .brainstormingSavedPath,
          )
          const path = selected ?? existingPath
          if (!path) return false
          const contents = await readFile(path).catch(() => null)
          if (!contents) return false
          if (!selected && before !== null && (await stat(path)).mtimeMs === before) return false
          result = path
          return true
        })
        .toBe(true)
      await expect(page.locator('.save-status')).not.toContainText('正在处理')
      return result
    },
  }
}

export const recoveryBytes = async (page: Page): Promise<Buffer | null> =>
  nativeRecoveryBytes(nativeSession(page).directory)
