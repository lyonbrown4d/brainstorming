import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createExampleDocument, createWorkbook } from '@core'
import type { DocumentExportsAPI } from '@shared/documentExports'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { initializeI18n } from '@renderer/i18n'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'

const workbook = createWorkbook(createExampleDocument())
const currentSheetId = workbook.sheets[0]?.id ?? ''
const prepare = fn<DocumentExportsAPI['prepare']>()
const exportDocument = fn<DocumentExportsAPI['exportDocument']>()
const openResult = fn<DocumentExportsAPI['openResult']>()
const api: DocumentExportsAPI = {
  prepare,
  exportDocument,
  presentationPages: () =>
    Promise.resolve([
      {
        title: 'Slide 1',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>',
        width: 160,
        height: 90,
      },
      {
        title: 'Slide 2',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>',
        width: 160,
        height: 90,
      },
    ]),
  cancel: () => Promise.resolve(true),
  onProgress: () => () => undefined,
  openResult,
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

const meta = {
  title: 'Brainstorming/导出中心',
  component: ExportDialog,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: { workbook, currentSheetId, defaultOpen: true, exportAPI: api },
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    localStorage.removeItem('brainstorming-export-center-v2')
    prepare.mockReset().mockImplementation((request) => Promise.resolve(request.workbook))
    exportDocument.mockReset().mockResolvedValue('/tmp/brainstorming.docx')
    openResult.mockReset().mockResolvedValue()
    return installPlatformAPI(createStoryDesktop())
  },
} satisfies Meta<typeof ExportDialog>
export default meta
type Story = StoryObj<typeof meta>

const choose = async (element: HTMLElement, label: string, option: string) => {
  const ui = within(element.ownerDocument.body)
  await userEvent.click(ui.getByRole('combobox', { name: label }))
  await userEvent.click(await within(document.body).findByRole('option', { name: option }))
}

export const GroupsAndResult: Story = {
  play: async ({ canvasElement }) => {
    const ui = within(canvasElement.ownerDocument.body)
    await expect(ui.getByRole('heading', { name: '导出中心' })).toBeVisible()
    await userEvent.click(ui.getByRole('button', { name: '文档' }))
    await choose(canvasElement, '导出格式', 'Word 文档')
    await choose(canvasElement, '导出范围', '全部画布')
    await userEvent.click(ui.getByRole('button', { name: '导出 DOCX' }))
    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1))
    await expect(exportDocument.mock.calls[0]?.[0]).toMatchObject({
      format: 'docx',
      sheetIds: [currentSheetId],
    })
    await userEvent.click(await ui.findByRole('button', { name: '打开文件' }))
    await expect(openResult).toHaveBeenCalledWith('/tmp/brainstorming.docx', false)
  },
}

export const PdfAndPresentationPreview: Story = {
  play: async ({ canvasElement }) => {
    const ui = within(canvasElement.ownerDocument.body)
    await userEvent.click(ui.getByRole('button', { name: '文档' }))
    await choose(canvasElement, '导出内容', '演示页面')
    await waitFor(() => expect(ui.getByText('第 1 / 2 页')).toBeVisible())
    await userEvent.click(ui.getByRole('button', { name: '下一页' }))
    await expect(ui.getByText('第 2 / 2 页')).toBeVisible()
    await choose(canvasElement, '纸张', 'A4')
    await expect(ui.getByRole('combobox', { name: '纸张' })).toHaveTextContent('A4')
  },
}

export const Failure: Story = {
  play: async ({ canvasElement }) => {
    const ui = within(canvasElement.ownerDocument.body)
    await userEvent.click(ui.getByRole('button', { name: '交换格式' }))
    exportDocument.mockRejectedValueOnce(new Error('磁盘空间不足'))
    await userEvent.click(ui.getByRole('button', { name: '导出 MD' }))
    await expect(await ui.findByRole('alert')).toHaveTextContent('磁盘空间不足')
  },
}

export const CancelBeforeStart: Story = {
  play: async ({ canvasElement }) => {
    const ui = within(canvasElement.ownerDocument.body)
    await userEvent.click(ui.getByRole('button', { name: '交换格式' }))
    prepare.mockClear()
    let finishPrepare: ((value: typeof workbook) => void) | undefined
    prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrepare = resolve
        }),
    )
    await userEvent.click(ui.getByRole('button', { name: '导出 MD' }))
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))
    await userEvent.click(ui.getByRole('button', { name: '取消导出' }))
    finishPrepare?.(workbook)
    await waitFor(() => expect(ui.getByText('已取消导出')).toBeVisible())
    await expect(exportDocument).not.toHaveBeenCalled()
  },
}
