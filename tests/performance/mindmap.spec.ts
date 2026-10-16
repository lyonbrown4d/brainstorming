import { expect, test } from '@playwright/test'
import { createFixtureDocument, serializeDocument } from '../../src/core'

for (const count of [100, 1_000, 5_000]) {
  test(`${count} 主题固定文档打开与交互采样`, async ({ page }, testInfo) => {
    const contents = serializeDocument(createFixtureDocument(count))
    const samples: number[] = []
    const mounted: number[] = []
    for (let sample = 0; sample < 3; sample += 1) {
      await page.goto('/')
      const picker = page.waitForEvent('filechooser')
      const started = performance.now()
      await page.getByRole('button', { name: '文件菜单', exact: true }).click()
      await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
      await (
        await picker
      ).setFiles({
        name: `fixed-${count}.trelyx`,
        mimeType: 'application/json',
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
          viewport: { width: 1440, height: 960 },
          note: '开发构建，含文件选择和解析；仅报告，无性能阈值。',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
  })
}
