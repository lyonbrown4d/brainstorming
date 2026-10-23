import { copyFile, readFile, stat } from 'node:fs/promises'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import type { EditorWindow } from '@shared/windows'
import { creationReady, editorReady } from '@tests/native/readiness'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  chooseFile,
  create,
  dockAction,
  editor,
  fillContentEditable,
  fixture,
  focusNativeWindow,
  home,
  named,
  native,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'
import {
  assertNativeMenus,
  closeSecondaryWindow,
  decodedPng,
  exportDialog,
  menuEntry,
  nativeMenus,
  observeExportStates,
  recordedExportStates,
  searchablePdf,
  selectExportFormat,
  selectExportOption,
  writeExport,
  zipContents,
} from '@tests/native/export-files'

const title = '中文导出验收'
const child = '预算,收入与计划'
const second = '第二画布发布排期'
const sampleDocument = async (): Promise<void> => {
  await home()
  await create(title)
  await root().click()
  await browser.keys(Key.Tab)
  await fillContentEditable(editor(), child)
  await named('适应画布').click()
  await editorReady()
  await named('新建画布').click()
  await creationReady('structure', 'sheet')
  await named('下一步').click()
  await creationReady('configuration', 'sheet')
  await named('画布名称').setValue(second)
  await named('创建画布').click()
  await editorReady(second)
  await expect(browser.$$('.sheet-tab')).toBeElementsArrayOfSize(2)
  await save(artifact('export-source'))
  await dockAction('导出')
  await expect(exportDialog().$('h2')).toHaveText('导出中心')
  await selectExportOption('导出范围', '全部画布')
}

describe('native export center', () => {
  it('writes searchable Chinese PDF, editable Word and quoted CSV from both sheets', async () => {
    await sampleDocument()
    await selectExportFormat('文档', 'PDF 文档')
    await selectExportOption('导出内容', '导图内容')
    const preview = exportDialog().$('[aria-label="导出预览"]')
    await expect(preview).toHaveAttribute('aria-busy', 'false')
    await expect(preview.$('img')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('export-center-map.png'))
    const size = await browser.getWindowSize()
    try {
      await browser.setWindowSize(800, 600)
      await expect(exportDialog().$('button=导出 PDF')).toBeDisplayed()
      await browser.saveScreenshot(await nativeArtifact('export-center-small.png'))
    } finally {
      await browser.setWindowSize(size.width, size.height)
    }
    await observeExportStates()
    const pdf = await searchablePdf(await writeExport('pdf'))
    expect(pdf).toContain(title)
    expect(pdf).toContain(child)
    expect(pdf).toContain(second)
    const states = (await recordedExportStates()).join('\n')
    expect(states).toContain('取消导出')
    expect(states).toMatch(/正在生成文件|正在渲染图片|正在编码图片|请选择保存位置|正在写入文件/)
    await selectExportFormat('文档', 'Word 文档')
    const docx = await zipContents(await writeExport('docx'))
    expect(docx['[Content_Types].xml']).toContain('wordprocessingml.document')
    expect(docx['word/document.xml']).toContain(title)
    expect(docx['word/document.xml']).toContain(child)
    expect(docx['word/document.xml']).toContain(second)
    await selectExportFormat('交换格式', 'CSV 表格')
    const csv = await readFile(await writeExport('csv'), 'utf8')
    expect(csv).toMatch(/^Sheet,Topic ID,Parent ID,Depth,Title,Notes,URL\r\n/)
    expect(csv).toContain(`"${child}"`)
    expect(csv).toContain(second)
    await exportDialog().$('button=关闭').click()
  })

  it('previews presentation pages and writes a batch ZIP, then cancels without a result', async () => {
    await sampleDocument()
    await selectExportFormat('图片', 'SVG 矢量图')
    await selectExportOption('导出内容', '演示页面')
    await expect(named('下一页')).toBeEnabled()
    await expect(named('上一页')).toBeDisabled()
    const firstPreview = await exportDialog().$('img').getAttribute('src')
    await named('下一页').click()
    await expect(named('上一页')).toBeEnabled()
    await browser.waitUntil(
      async () => (await exportDialog().$('img').getAttribute('src')) !== firstPreview,
    )
    await browser.saveScreenshot(await nativeArtifact('export-center-presentation.png'))
    // The chosen format remains SVG; multiple pages are delivered as a ZIP archive.
    const destination = await chooseFile('save', artifact('export-pages', 'zip'))
    await exportDialog().$('button=导出 SVG').click()
    await expect(exportDialog().$('[role="status"]')).toHaveText('已导出')
    const contents = await zipContents(destination)
    const pages = Object.entries(contents).filter(([name]) => name.endsWith('.svg'))
    expect(pages.length).toBeGreaterThanOrEqual(3)
    const all = pages.map(([, svg]) => svg).join('\n')
    expect(all).toContain('<svg')
    expect(all).toContain(title)
    expect(all).toContain(child)
    expect(all).toContain(second)
    const cancelled = await chooseFile('save', artifact('cancelled-export', 'zip'), true)
    await exportDialog().$('button=导出 SVG').click()
    await expect(exportDialog().$('[role="status"]')).toHaveText('已取消导出')
    await expect(exportDialog().$('button=打开文件')).not.toExist()
    await expect(exportDialog().$('button=在文件夹中显示')).not.toExist()
    await expect(exportDialog().$('button=导出 SVG')).toBeEnabled()
    await expect(stat(cancelled)).rejects.toMatchObject({ code: 'ENOENT' })
    await exportDialog().$('button=关闭').click()
    await rootHasText(second)
  })

  it('captures the current 3D view as a decodable PNG and restores the export dialog', async () => {
    await home()
    await create('当前三维视角导出')
    await named('三维视图').click()
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer] canvas')).toBeDisplayed()
    await editorReady('当前三维视角导出')
    await dockAction('导出')
    await selectExportFormat('图片', 'PNG 图片')
    await selectExportOption('导出内容', '当前 3D 视角')
    await selectExportOption('输出比例', '1×')
    await named('截取视角预览').click()
    const preview = exportDialog().$('[aria-label="导出预览"] img')
    await expect(preview).toBeDisplayed()
    const dimensions = await browser.execute(async () => {
      const image = document.querySelector<HTMLImageElement>('[aria-label="导出预览"] img')
      if (!image) throw new Error('The current 3D view preview is missing')
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight }
    })
    await browser.saveScreenshot(await nativeArtifact('export-center-3d.png'))
    expect(dimensions.width).toBeGreaterThan(0)
    expect(dimensions.height).toBeGreaterThan(0)
    await expect(exportDialog().$('h2')).toHaveText('导出中心')
    await expect(browser.$('html')).not.toHaveAttribute('data-export-capture')
    const path = await writeExport('png')
    expect(await decodedPng(path)).toEqual(dimensions)
    await copyFile(path, await nativeArtifact('export-center-3d-output.png'))
    await expect(exportDialog()).toBeDisplayed()
    await expect(browser.$('html')).not.toHaveAttribute('data-export-capture')
    await exportDialog().$('button=关闭').click()
    await editorReady('当前三维视角导出')
  })

  it('routes the native Export menu to the focused secondary document window', async () => {
    await home()
    await assertNativeMenus(false)
    await create('主窗口不可导出')
    await save(artifact('export-menu-main'))
    await assertNativeMenus(true)
    await fixture('menu', { id: 'newWindow' })
    let label = ''
    await browser.waitUntil(async () => {
      label =
        (await native<EditorWindow[]>('listWindows')).find((window) => window.id !== 'main')?.id ??
        ''
      return label !== ''
    })
    await browser.tauri.switchWindow(label)
    try {
      await native('startupReady')
      await create('当前窗口菜单导出')
      await save(artifact('export-menu-focused'))
      await focusNativeWindow()
      await assertNativeMenus(true)
      const menus = await nativeMenus()
      expect(menuEntry(menus, 'focusWindow:main')?.enabled).toBe(true)
      expect(menuEntry(menus, `focusWindow:${label}`)?.enabled).toBe(true)
      expect(menuEntry(menus, 'moveTabWindow:main')?.enabled).toBe(true)
      await fixture('menu', { id: 'export' })
      await expect(exportDialog().$('h2')).toHaveText('导出中心')
      await selectExportFormat('交换格式', '纯文本大纲')
      await selectExportOption('导出范围', '当前画布')
      const text = await readFile(await writeExport('txt'), 'utf8')
      expect(text).toContain('当前窗口菜单导出')
      expect(text).not.toContain('主窗口不可导出')
      await exportDialog().$('button=关闭').click()
    } finally {
      await closeSecondaryWindow()
      await native('startupReady')
    }
    await expect(exportDialog()).not.toExist()
    await rootHasText('主窗口不可导出')
  })
})
