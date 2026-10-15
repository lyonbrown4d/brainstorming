export type Side = 'left' | 'right'

export interface Topic {
  readonly id: string
  readonly title: string
  readonly children: readonly string[]
  readonly collapsed: boolean
  readonly side: Side
}

export interface MindMapDocument {
  readonly format: 'trelyx'
  readonly version: 1
  readonly id: string
  readonly title: string
  readonly rootId: string
  readonly topics: Readonly<Record<string, Topic>>
}

export type Command =
  | {
      readonly type: 'addTopic'
      readonly parentId: string
      readonly id: string
      readonly title: string
      readonly index?: number
      readonly side?: Side
    }
  | { readonly type: 'renameTopic'; readonly topicId: string; readonly title: string }
  | { readonly type: 'deleteTopic'; readonly topicId: string }
  | {
      readonly type: 'moveTopic'
      readonly topicId: string
      readonly parentId: string
      readonly index?: number
      readonly side?: Side
    }
  | { readonly type: 'toggleCollapse'; readonly topicId: string }
  | { readonly type: 'setSide'; readonly topicId: string; readonly side: Side }

export type TopicCommand = Command

export interface HistoryState {
  readonly document: MindMapDocument
  readonly past: readonly MindMapDocument[]
  readonly future: readonly MindMapDocument[]
}
