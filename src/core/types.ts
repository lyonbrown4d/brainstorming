export type Side = 'left' | 'right'

export interface TopicStyle {
  readonly fill?: string
  readonly color?: string
  readonly fontSize?: number
  readonly bold?: boolean
  readonly italic?: boolean
  readonly shape?: 'rounded' | 'rectangle' | 'ellipse'
  readonly lineStyle?: 'curve' | 'straight'
  readonly lineWidth?: number
}

export interface Topic {
  readonly id: string
  readonly title: string
  readonly children: readonly string[]
  readonly collapsed: boolean
  readonly side: Side
  readonly style?: TopicStyle
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
  | { readonly type: 'setTopicStyle'; readonly topicId: string; readonly style: TopicStyle }

export interface MindMapSheet {
  readonly id: string
  readonly name: string
  readonly document: MindMapDocument
}

export interface MindMapWorkbook {
  readonly format: 'trelyx'
  readonly version: 2
  readonly id: string
  readonly title: string
  readonly sheets: readonly MindMapSheet[]
}

export type WorkbookCommand =
  | { readonly type: 'addSheet'; readonly sheet: MindMapSheet; readonly index?: number }
  | { readonly type: 'renameSheet'; readonly sheetId: string; readonly name: string }
  | { readonly type: 'duplicateSheet'; readonly sheetId: string; readonly id: string }
  | { readonly type: 'deleteSheet'; readonly sheetId: string }
  | { readonly type: 'moveSheet'; readonly sheetId: string; readonly index: number }
  | { readonly type: 'updateSheet'; readonly sheetId: string; readonly document: MindMapDocument }

export type TopicCommand = Command

export interface HistoryState {
  readonly document: MindMapDocument
  readonly past: readonly MindMapDocument[]
  readonly future: readonly MindMapDocument[]
}
