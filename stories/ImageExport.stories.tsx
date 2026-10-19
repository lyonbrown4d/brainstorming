import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createExampleDocument, createWorkbook } from '@core'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { initializeI18n } from '@renderer/i18n'
import { createStoryDesktop } from '@stories/desktopBridge'
import type { ImageExportAPI, ImageExportProgress } from '@shared/exportImages'

const workbook = createWorkbook(createExampleDocument())
const sheetId = workbook.sheets[0]?.id ?? ''
const imageExport = fn<ImageExportAPI['exportImage']>()
const listeners = new Set<(event: ImageExportProgress) => void>()
const meta = {
  title: 'Brainstorming/图片导出',
  component: ExportDialog,
  args: { workbook, currentSheetId: sheetId, defaultOpen: true },
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    imageExport.mockReset().mockImplementation((request) => Promise.resolve(request.suggestedName))
    listeners.clear()
    const restore = installPlatformAPI({
      ...createStoryDesktop(),
      exportImage: imageExport,
      onExportProgress: (callback) => {
        listeners.add(callback)
        return () => {
          listeners.delete(callback)
        }
      },
    })
    return () => {
      restore()
      listeners.clear()
    }
  },
} satisfies Meta<typeof ExportDialog>
export default meta
type Story = StoryObj<typeof meta>
const ready = async (element: HTMLElement) => {
  const dialog = within(element.ownerDocument.body).getByRole('dialog')
  const ui = within(dialog)
  await waitFor(() => expect(ui.getByRole('button', { name: '导出文件' })).toBeEnabled())
  return ui
}
const choose = async (element: HTMLElement, label: string, option: string) => {
  const page = within(element.ownerDocument.body)
  await userEvent.click(page.getByRole('combobox', { name: label }))
  await userEvent.click(await page.findByRole('option', { name: option }))
}
export const Preview: Story = {}
export const DarkPreview: Story = {
  beforeEach: () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      document.documentElement.removeAttribute('data-theme')
    }
  },
}
export const HighQualityDefault: Story = {
  play: async ({ canvasElement }) => {
    const ui = await ready(canvasElement)
    await expect(ui.getByRole('combobox', { name: '图片清晰度' })).toHaveTextContent('高清 · 自动')
    await expect(ui.getByRole('img', { name: workbook.sheets[0]?.name ?? '' })).toBeVisible()
    await expect(ui.getByText(/px$/)).toBeVisible()
    await userEvent.click(ui.getByRole('button', { name: '导出文件' }))
    await waitFor(() => expect(imageExport).toHaveBeenCalledTimes(1))
    const request = imageExport.mock.calls[0]?.[0]
    await expect(request?.format).toBe('png')
    await expect(request?.scale).toBeUndefined()
    await expect(request?.svg).toContain('<svg')
    await expect(await ui.findByRole('status')).toHaveTextContent('.png')
  },
}
export const FormatsAndQuality: Story = {
  play: async ({ canvasElement }) => {
    const ui = await ready(canvasElement)
    await choose(canvasElement, '导出格式', 'JPEG 图片')
    await expect(ui.getByRole('combobox', { name: 'JPEG 画质' })).toHaveTextContent('92%')
    await choose(canvasElement, '图片清晰度', '超清 · 3×')
    await userEvent.click(ui.getByRole('button', { name: '导出文件' }))
    await waitFor(() => expect(imageExport).toHaveBeenCalledTimes(1))
    await expect(imageExport.mock.calls[0]?.[0]).toMatchObject({
      format: 'jpg',
      jpegQuality: 92,
      scale: 3,
    })
    await waitFor(() => expect(ui.getByRole('button', { name: '导出文件' })).toBeEnabled())
    await choose(canvasElement, '导出格式', 'WebP 图片')
    await expect(ui.queryByRole('combobox', { name: 'JPEG 画质' })).not.toBeInTheDocument()
    await expect(ui.getByText('WebP 使用无损压缩，保留图片细节。')).toBeVisible()
    await userEvent.click(ui.getByRole('button', { name: '导出文件' }))
    await waitFor(() => expect(imageExport).toHaveBeenCalledTimes(2))
    await expect(imageExport.mock.calls[1]?.[0]?.format).toBe('webp')
    await waitFor(() => expect(ui.getByRole('button', { name: '导出文件' })).toBeEnabled())
    await choose(canvasElement, '导出格式', 'SVG 矢量图')
    await expect(ui.queryByRole('combobox', { name: '图片清晰度' })).not.toBeInTheDocument()
    await expect(ui.getByText('矢量 · 可无损缩放')).toBeVisible()
    await choose(canvasElement, '导出格式', 'Markdown 大纲')
    await expect(ui.queryByRole('img')).not.toBeInTheDocument()
    await choose(canvasElement, '导出格式', 'PNG 图片')
    await waitFor(() =>
      expect(ui.getByRole<HTMLImageElement>('img').naturalWidth).toBeGreaterThan(0),
    )
  },
}
export const ProgressAndDuplicateSubmission: Story = {
  play: async ({ canvasElement }) => {
    const ui = await ready(canvasElement)
    let finish: (value: string | null) => void = () => undefined
    imageExport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const button = ui.getByRole('button', { name: '导出文件' })
    await userEvent.dblClick(button)
    await expect(imageExport).toHaveBeenCalledTimes(1)
    await expect(button).toBeDisabled()
    await expect(ui.getByRole('status')).toHaveTextContent('请选择保存位置')
    const jobId = imageExport.mock.calls[0]?.[0]?.jobId
    if (!jobId) throw new Error('Missing job ID')
    for (const listener of listeners) listener({ jobId: crypto.randomUUID(), stage: 'writing' })
    await expect(ui.getByRole('status')).toHaveTextContent('请选择保存位置')
    for (const listener of listeners) listener({ jobId, stage: 'encoding' })
    await waitFor(() => expect(ui.getByRole('status')).toHaveTextContent('正在编码图片'))
    await userEvent.keyboard('{Escape}')
    await expect(ui.getByRole('heading', { name: '导出导图' })).toBeVisible()
    finish('high-quality.png')
    await waitFor(() => expect(button).toBeEnabled())
    await expect(ui.getByRole('status')).toHaveTextContent('high-quality.png')
  },
}
export const FailureAndCancel: Story = {
  play: async ({ canvasElement }) => {
    const ui = await ready(canvasElement)
    imageExport.mockRejectedValueOnce(new Error('无法写入，请选择其他位置'))
    await userEvent.click(ui.getByRole('button', { name: '导出文件' }))
    await expect(await ui.findByRole('alert')).toHaveTextContent('请选择其他位置')
    await waitFor(() => expect(ui.getByRole('button', { name: '导出文件' })).toBeEnabled())
    imageExport.mockResolvedValueOnce(null)
    await userEvent.click(ui.getByRole('button', { name: '导出文件' }))
    await expect(await ui.findByRole('status')).toHaveTextContent('已取消导出')
    await expect(ui.queryByRole('alert')).not.toBeInTheDocument()
  },
}
export const English: Story = {
  beforeEach: async () => {
    await initializeI18n('en')
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByRole('button', { name: 'Export file' })).toBeEnabled())
    await expect(page.getByRole('combobox', { name: 'Image quality' })).toHaveTextContent(
      'High quality',
    )
  },
}
