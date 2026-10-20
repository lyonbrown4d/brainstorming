import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { CreationGalleryProps } from '@renderer/components/creation/types'
import { CreationGallery } from '@renderer/components/creation/CreationGallery'
import { initializeI18n } from '@renderer/i18n'

const meta = {
  title: 'Brainstorming/异步创建',
  component: CreationGallery,
  args: { mode: 'document', step: 2, onCreate: fn<CreationGalleryProps['onCreate']>(() => true) },
  beforeEach: () => initializeI18n('zh-CN'),
} satisfies Meta<typeof CreationGallery>
export default meta
type Story = StoryObj<typeof meta>

let finish: (result: boolean) => void = () => undefined
export const PendingAndRetry: Story = {
  args: {
    onCreate: fn<CreationGalleryProps['onCreate']>(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '创建文档' }))
    await expect(canvas.getByRole('button', { name: '正在创建…' })).toBeDisabled()
    await expect(canvas.getByRole('textbox', { name: '文档名称' })).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
    finish(false)
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: '创建文档' })).toBeEnabled()
    })
    await expect(canvas.getByRole('alert')).toHaveTextContent('创建失败，请重试。')
    await userEvent.click(canvas.getByRole('button', { name: '创建文档' }))
    await expect(args.onCreate).toHaveBeenCalledTimes(2)
    finish(true)
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: '创建文档' })).toBeDisabled()
    })
  },
}

export const RejectedSubmission: Story = {
  args: {
    onCreate: fn<CreationGalleryProps['onCreate']>(() => Promise.reject(new Error('Unavailable'))),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '创建文档' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('创建失败，请重试。')
    await expect(canvas.getByRole('button', { name: '创建文档' })).toBeEnabled()
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
  },
}
