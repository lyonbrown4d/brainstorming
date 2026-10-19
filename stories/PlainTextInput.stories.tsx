import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlainTextInput } from '@renderer/components/inputs/PlainTextInput'
import { AnnotationLabelInput } from '@renderer/components/annotations/AnnotationLabelInput'
import { Button } from '@renderer/components/ui/button'
import '@renderer/styles/ui.css'

const InputExample = () => {
  const [value, setValue] = useState('原始文字')
  const [committed, setCommitted] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const [restore, setRestore] = useState('')
  return (
    <div className="grid w-96 gap-3 p-4">
      <PlainTextInput
        label="多行正文"
        value={value}
        onValueChange={setValue}
        onBlur={setCommitted}
        onSubmit={setCommitted}
        onCancel={() => {
          setCancelled(true)
        }}
        submitMode="modifier-enter"
        maxLength={30}
      />
      <Button
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onClick={() => {
          setRestore(value)
          setValue('外部重置')
        }}
      >
        重置
      </Button>
      <Button
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onClick={() => {
          setValue(restore)
        }}
      >
        恢复外部值
      </Button>
      <output aria-label="草稿">{value}</output>
      <output aria-label="提交">{committed}</output>
      <output aria-label="取消">{String(cancelled)}</output>
    </div>
  )
}
const meta = {
  title: 'Brainstorming/多行文本输入',
  component: InputExample,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof InputExample>
export default meta
type Story = StoryObj<typeof meta>

export const Editing: Story = {}

const AnnotationExample = () => {
  const [committed, setCommitted] = useState('')
  const [cancelled, setCancelled] = useState(false)
  return (
    <div className="space-y-4 p-4">
      <AnnotationLabelInput
        kind="callout"
        text="替换我"
        onCommit={setCommitted}
        onCancel={() => {
          setCancelled(true)
        }}
      />
      <output aria-label="提交">{committed}</output>
      <output aria-label="取消">{String(cancelled)}</output>
    </div>
  )
}

export const Annotation: Story = { render: AnnotationExample }
