import { browser, expect } from '@wdio/globals'
import { imageBase64, attachmentBytes } from '@tests/fixtures/content'
import {
  artifact,
  chooseFile,
  closeSaved,
  create,
  dockAction,
  ensureProperties,
  fixture,
  home,
  named,
  native,
  openSaved,
  recovery,
  reloadNativePage,
  rootHasText,
  textContains,
  save,
} from '@tests/native/driver'

interface FileInspection {
  length: number
  sqlite: boolean
}
describe('native content and password protection', () => {
  beforeEach(async () => {
    await home()
  })

  it('persists Chinese notes, embedded raster/attachment resources and exports attachment bytes', async () => {
    await create('媒体笔记')
    await ensureProperties()
    await named('主题备注').setValue('中文备注\n第二行')
    const imageName = artifact('color-card', 'png')
    const attachmentName = artifact('attachment', 'bin')
    await fixture('write', { name: imageName, base64: imageBase64 })
    await chooseFile('asset', imageName)
    await named('添加图片').click()
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          (name) => [...document.images].find((image) => image.alt === name)?.naturalWidth ?? 0,
          imageName,
        )) === 64,
    )
    await fixture('write', {
      name: attachmentName,
      base64: Buffer.from(attachmentBytes).toString('base64'),
    })
    await chooseFile('asset', attachmentName)
    await named('添加附件').click()
    await textContains('.topic-attachment-name', attachmentName)
    const exported = artifact('exported-attachment', 'bin')
    await chooseFile('save', exported)
    await named(`另存附件 ${attachmentName}`).click()
    await browser.waitUntil(async () => {
      try {
        return (
          (await fixture<FileInspection>('inspect', { name: exported })).length ===
          attachmentBytes.length
        )
      } catch {
        return false
      }
    })
    const name = artifact('content')
    const workbook = await save(name)
    expect(Object.keys(workbook.sheets[0]?.document.assets ?? {})).toHaveLength(2)
    expect(workbook.sheets[0]?.document.topics.root?.attachments).toHaveLength(1)
    expect(
      Object.values(workbook.sheets[0]?.document.assets ?? {}).map((asset) => asset.name),
    ).toContain(attachmentName)
    expect(workbook.sheets[0]?.document.topics.root?.notes).toBe('中文备注\n第二行')
    await closeSaved()
    await openSaved(name)
    await rootHasText('媒体笔记')
    await ensureProperties()
    await textContains('[aria-label="主题备注"]', '中文备注\n第二行')
    await expect(browser.$(`img[alt="${imageName}"]`)).toBeDisplayed()
    await textContains('.topic-attachment-name', attachmentName)
  })

  it('encrypts files/recovery and allows cancel, wrong-password retry and successful activation', async () => {
    const password = 'native-e2e-example-password'
    await create('保密导图')
    await dockAction('文件密码')
    const settings = browser.$('[role="dialog"]')
    const fields = settings.$$('input[type="password"]')
    await expect(fields).toBeElementsArrayOfSize(2)
    await settings.$('aria/密码').setValue(password)
    await settings.$('aria/确认密码').setValue(password)
    await settings.$('button=启用密码').click()
    await expect(settings).not.toBeDisplayed()
    const name = artifact('encrypted')
    const workbook = await save(name, password)
    expect(await fixture<FileInspection>('inspect', { name })).toEqual(
      expect.objectContaining({ sqlite: false }),
    )
    await browser.waitUntil(async () =>
      (await recovery()).some((item) => item.encrypted && item.lockedToken),
    )
    await closeSaved()
    await openSaved(name)
    const unlock = browser.$('[role="dialog"]')
    await expect(unlock).toHaveText(expect.stringContaining('解锁思维导图'))
    await unlock.$('button=取消').click()
    await expect(named('探索示例')).toBeDisplayed()
    await openSaved(name)
    await unlock.$('input[type="password"]').setValue('wrong-password')
    await unlock.$('button=解锁').click()
    await expect(unlock.$('[role="alert"]')).toHaveText(expect.stringContaining('密码错误'))
    await unlock.$('input[type="password"]').setValue(password)
    await unlock.$('button=解锁').click()
    await rootHasText('保密导图')
    expect(await native('getFileSecurity', { documentId: workbook.id })).toEqual({
      encrypted: true,
    })
    expect((await fixture<FileInspection>('inspect', { name })).sqlite).toBe(false)
    await browser.waitUntil(async () =>
      (await recovery()).some((item) => item.encrypted && item.lockedToken),
    )
    await reloadNativePage()
    await expect(named('恢复上次打开的 1 份导图')).toBeDisplayed()
    await named('恢复上次打开的 1 份导图').click()
    await expect(unlock).toHaveText(expect.stringContaining('解锁自动恢复记录'))
    await unlock.$('input[type="password"]').setValue(password)
    await unlock.$('button=解锁').click()
    await rootHasText('保密导图')
  })
})
