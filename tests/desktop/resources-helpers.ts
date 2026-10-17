import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { topicProperties } from '@tests/e2e/properties'
import { completeDocumentCreation } from '@tests/e2e/workspace'

export const createResourceDocument = async (page: Page): Promise<void> => {
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeVisible()
  await completeDocumentCreation(page, '资源集成验证')
  await page.getByTestId('topic-root').click()
}

export const selectResourceFile = async (app: ElectronApplication, path: string): Promise<void> => {
  await app.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] })
  }, path)
}

export const dropNativeFile = async (page: Page, path: string): Promise<void> => {
  const bounds = await page.getByTestId('topic-root').boundingBox()
  if (!bounds) throw new Error('Drop target is unavailable')
  const session = await page.context().newCDPSession(page)
  const position = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  try {
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
      await session.send('Input.dispatchDragEvent', {
        type,
        ...position,
        data: { items: [], files: [path], dragOperationsMask: 1 },
      })
    }
  } finally {
    await session.detach()
  }
}

export const assertStoredImageViewer = async (page: Page, imageName: string): Promise<void> => {
  const panel = await topicProperties(page)
  const preview = panel.getByRole('img', { name: imageName, exact: true })
  await expect(preview).toBeVisible()
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true)
  await expect(preview).toHaveAttribute(
    'src',
    /^brainstorming-resource:\/\/[a-f0-9]+\/object\/[a-f0-9]{64}$/u,
  )
  const tileResponse = page.waitForResponse(
    (response) => response.url().includes('/tile/') && response.status() === 200,
  )
  await panel.getByRole('button', { name: '预览图片', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '主题图片', exact: true })
  const region = dialog.getByRole('region', { name: '预览图片', exact: true })
  await expect(region).toHaveAttribute('aria-busy', 'false')
  expect((await tileResponse).headers()['content-type']).toBe('image/webp')
  await expect(dialog.getByRole('button', { name: '放大', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '放大', exact: true }).click()
  await dialog.getByRole('button', { name: '适应画布', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭图片预览', exact: true }).click()
}

export const fetchResourceBytes = (page: Page, url: string, range?: string) =>
  page.evaluate(
    async ({ target, requestedRange }) => {
      const response = await fetch(
        target,
        requestedRange ? { headers: { Range: requestedRange } } : {},
      )
      return {
        status: response.status,
        contentType: response.headers.get('Content-Type'),
        contentRange: response.headers.get('Content-Range'),
        bytes: [...new Uint8Array(await response.arrayBuffer())],
      }
    },
    { target: url, requestedRange: range },
  )
