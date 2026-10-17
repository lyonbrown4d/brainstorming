import { expect, userEvent, waitFor, within } from 'storybook/test'

const openProperties = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const trigger = canvas.getByRole('button', { name: '属性面板' })
  if (trigger.getAttribute('aria-pressed') !== 'true') await userEvent.click(trigger)
  const element = await canvas.findByRole('complementary', { name: '属性面板' })
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

export const openTopicProperties = async (canvasElement: HTMLElement) => {
  const panel = await openProperties(canvasElement)
  const tabs = within(panel.getByRole('tablist', { name: '属性类别' }))
  const topic = tabs.getByRole('tab', { name: '主题' })
  await userEvent.click(topic)
  await expect(topic).toHaveAttribute('aria-selected', 'true')
  return panel
}

export const openCanvasProperties = async (
  canvasElement: HTMLElement,
  section: '结构' | '配色' | '模板' = '结构',
) => {
  const panel = await openProperties(canvasElement)
  const tabs = within(panel.getByRole('tablist', { name: '属性类别' }))
  const canvas = tabs.getByRole('tab', { name: '画布' })
  await userEvent.click(canvas)
  await expect(canvas).toHaveAttribute('aria-selected', 'true')
  const sections = within(panel.getByRole('tablist', { name: '画布设置' }))
  const selected = sections.getByRole('tab', { name: section })
  await userEvent.click(selected)
  await expect(selected).toHaveAttribute('aria-selected', 'true')
  return panel
}
