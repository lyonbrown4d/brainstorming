import { browser, expect } from '@wdio/globals'
import { basename } from 'node:path'
import { selectExportFormat, writeExport } from '@tests/native/export-files'
import {
  chooseFile,
  create,
  dockAction,
  fileAction,
  fixture,
  home,
  rootHasText,
} from '@tests/native/driver'

describe('native interchange command integration', () => {
  it('exports four exchange formats through native pickers and reopens the XMind copy', async () => {
    await home()
    await create('原生格式往返')
    const formats = [
      ['md', 'Markdown 大纲'],
      ['opml', 'OPML 大纲'],
      ['txt', '纯文本大纲'],
      ['xmind', 'XMind 工作簿'],
    ] as const
    let xmindName = ''
    for (const [extension, label] of formats) {
      await dockAction('导出')
      await selectExportFormat('交换格式', label)
      const name = basename(await writeExport(extension))
      const dialog = browser.$('[role="dialog"]')
      const result = await fixture<{ length: number }>('inspect', { name })
      expect(result.length).toBeGreaterThan(10)
      await dialog.$('button=关闭').click()
      if (extension === 'xmind') xmindName = name
    }
    await chooseFile('open', xmindName)
    await fileAction('打开导图')
    await rootHasText('原生格式往返')
  })
})
