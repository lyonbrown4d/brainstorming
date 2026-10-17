import { prepareNativeOpen } from '@tests/electron/native-files'
import { reloadWindow } from '@tests/electron/session'
import { expect, test } from '@tests/electron/fixture'
import { createFixtureDocument, createWorkbook } from '@core'
import { encodeBrainstorming } from '@formats/brainstorming'

for (const count of [100, 1_000, 5_000]) {
  test(`${count} 主题固定文档打开与交互采样`, async ({ page }, testInfo) => {
    const contents = encodeBrainstorming(createWorkbook(createFixtureDocument(count)))
    const samples: number[] = []
    const mounted: number[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      await reloadWindow(page)
      const picker = await prepareNativeOpen(page)
      const started = performance.now()
      await page.getByRole('button', { name: '打开本地文件', exact: true }).click()
      await picker.selectFile({
        name: `fixed-${count}.brainstorming`,
        mimeType: 'application/vnd.brainstorming+zip',
        buffer: Buffer.from(contents),
      })
      await expect(page.getByTestId('topic-root')).toBeVisible()
      await expect(page.locator('.status-bar')).toContainText(`${count} 个主题`)
      samples.push(performance.now() - started)
      mounted.push(await page.locator('.react-flow__node').count())
      await page.getByRole('button', { name: '放大', exact: true }).click()
      await page.getByRole('button', { name: '缩小', exact: true }).click()
    }
    const median = [...samples].sort((a, b) => a - b)[1]
    await testInfo.attach(`performance-${count}.json`, {
      body: JSON.stringify(
        {
          count,
          samplesMs: samples,
          medianMs: median,
          mounted,
          viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
          note: '真实 Electron 生产构建，含原生文件选择和解析；仅报告，无性能阈值。',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
  })
}
