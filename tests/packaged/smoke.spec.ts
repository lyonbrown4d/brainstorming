import { _electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { decodeBrainstorming } from '@formats/brainstorming'
import { mainWindow } from '@tests/desktop/windows'
import { completeDocumentCreation } from '@tests/e2e/workspace'
import { seedChinese } from '@tests/electron/preferences'

test('打包应用使用隔离 SQLite 启动、新建并原生保存 ZIP，正常退出且无模块加载错误', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-packaged-'))
  let app: ElectronApplication | undefined
  let child: ChildProcess | undefined
  try {
    await seedChinese(directory)
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    )
    delete environment.ELECTRON_RENDERER_URL
    app = await _electron.launch({
      executablePath: resolve('release/mac-arm64/Brainstorming.app/Contents/MacOS/Brainstorming'),
      args: [`--user-data-dir=${directory}`],
      colorScheme: null,
      env: environment,
      timeout: 30_000,
    })
    const launchedProcess = app.process()
    child = launchedProcess
    const stderr: string[] = []
    launchedProcess.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk.toString())
    })
    const launched = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      name: app.getName(),
      directory: app.getPath('userData'),
    }))
    expect(launched.packaged).toBe(true)
    expect(launched.name).toBe('Brainstorming')
    expect(await realpath(launched.directory)).toBe(await realpath(directory))
    const page = await mainWindow(app)
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    expect(page.url()).toContain('app.asar/out/renderer/index.html')
    await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
    await expect(page.getByText('Brainstorming', { exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('brand-home.png') })
    await completeDocumentCreation(page, '打包应用原生保存')
    await page.screenshot({ path: test.info().outputPath('brand-editor.png') })
    const filePath = join(directory, 'packaged-save.brainstorming')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
    }, filePath)
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() =>
        readFile(filePath)
          .then((bytes) => decodeBrainstorming(bytes).sheets[0]?.document.title)
          .catch(() => ''),
      )
      .toBe('打包应用原生保存')
    await expect(page.locator('.save-status')).toContainText('已保存')
    expect((await stat(join(directory, 'brainstorming.sqlite'))).size).toBeGreaterThan(0)
    expect(errors).toEqual([])
    await app.close()
    await expect.poll(() => launchedProcess.exitCode).toBe(0)
    expect(stderr.join('')).not.toMatch(
      /ERR_MODULE_NOT_FOUND|Cannot find module|NODE_MODULE_VERSION|Could not locate the bindings file/i,
    )
  } finally {
    if (app && child?.exitCode === null && child.signalCode === null) {
      const closed = app.waitForEvent('close')
      child.kill('SIGKILL')
      await closed
    }
    await rm(directory, { recursive: true, force: true })
  }
})
