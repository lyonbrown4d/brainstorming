import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { IndependentSpatialPreview } from '@stories/IndependentSpatialEvidence'
import { setInkMode } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { useSpatialView } from '@renderer/state/spatialView'

const meta = {
  title: 'Brainstorming/空间视图',
  component: IndependentSpatialPreview,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useSelection.setState({ sheets: {}, drawings: {} })
    useSpatialView.setState({ views: {} })
    useEditor.getState().replace(
      applyCommand(createDocument('空间构思'), {
        type: 'batch',
        commands: [
          {
            type: 'setDocumentSettings',
            settings: { spatial: { mode: '3d', yaw: 0.7, pitch: 0.5, spacing: 100 } },
          },
          { type: 'addTopic', parentId: 'root', id: 'branch-a', title: '产品方向', side: 'right' },
          { type: 'addTopic', parentId: 'branch-a', id: 'detail', title: '用户访谈' },
          { type: 'addTopic', parentId: 'root', id: 'branch-b', title: '发布计划', side: 'left' },
          {
            type: 'upsertDrawing',
            stroke: {
              id: 'spatial-ink',
              color: '#e48a38',
              width: 8,
              points: [
                { x: 280, y: 330, pressure: 0.5 },
                { x: 350, y: 300, pressure: 0.7 },
                { x: 430, y: 330, pressure: 0.5 },
              ],
            },
          },
          {
            type: 'upsertRelation',
            relation: {
              id: 'spatial-relation',
              from: 'branch-a',
              to: 'branch-b',
              title: '互相支持',
            },
          },
        ],
      }),
    )
    useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
    return () => {
      setInkMode('select')
    }
  },
} satisfies Meta<typeof IndependentSpatialPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {}
