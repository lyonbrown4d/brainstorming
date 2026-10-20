import { browser, expect } from '@wdio/globals'
import {
  artifact,
  chooseFile,
  create,
  dockAction,
  fileAction,
  fixture,
  home,
  named,
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
      await named('导出格式').click()
      await browser.$(`[role="option"]=${label}`).click()
      const name = artifact('native-interchange', extension)
      await chooseFile('save', name)
      await expect(named('导出文件')).toBeEnabled()
      await named('导出文件').click()
      const dialog = browser.$('[role="dialog"]')
      await expect(dialog.$('[role="status"]')).toHaveText(expect.stringContaining(name))
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
