import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { defaultTopicFilters, useTopicFilters } from '@renderer/components/documents/filterTopics'

const meta = {
  title: 'Brainstorming/画布筛选',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const document = applyCommand(createDocument('筛选示例', 'filter-story'), {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'root', id: 'a', title: '祖先主题' },
        { type: 'addTopic', parentId: 'a', id: 'match', title: '待办事项' },
        { type: 'addTopic', parentId: 'root', id: 'other', title: '其他主题' },
        { type: 'setTopicMetadata', topicId: 'match', metadata: { labels: ['重点'] } },
        { type: 'toggleCollapse', topicId: 'a' },
      ],
    })
    useEditor.getState().replace(document)
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
    useTopicFilters.setState(defaultTopicFilters)
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
