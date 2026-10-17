import type { Meta, StoryObj } from '@storybook/react-vite'
import { createExampleDocument, createWorkbook } from '@core'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { ImportTextDialog } from '@renderer/components/ImportTextDialog'
import '@renderer/styles/ui.css'

const workbook = createWorkbook(createExampleDocument())
const meta = {
  title: 'Trelyx/导入与导出',
  component: ExportDialog,
  args: {
    workbook,
    currentSheetId: workbook.sheets[0]?.id ?? '',
    onExport: (request): Promise<string | null> => Promise.resolve(request.suggestedName),
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ExportDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Export: Story = { args: { defaultOpen: true } }
export const ImportOutline: Story = {
  render: () => <ImportTextDialog defaultOpen onImport={() => undefined} />,
}
export const SaveFailure: Story = {
  args: {
    defaultOpen: true,
    onExport: () => Promise.reject(new Error('测试：无法写入目标文件，请选择其他位置')),
  },
}
