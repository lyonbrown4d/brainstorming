import type {
  DocumentAnnotations,
  DocumentExtensions,
  ExtensionCommand,
  LayoutKind,
  TopicMetadata,
} from '@core/extensions'

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

export interface DocumentAsset {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  /** Canonical, padded base64 without a data URL prefix. */
  readonly data: string
}

export interface TopicImage {
  readonly assetId: string
  readonly width: number
  readonly height: number
}

export interface Topic {
  readonly id: string
  readonly title: string
  readonly children: readonly string[]
  readonly collapsed: boolean
  readonly side: Side
  readonly style?: TopicStyle
  readonly notes?: string
  readonly image?: TopicImage
  readonly attachments?: readonly string[]
  readonly metadata?: TopicMetadata
  readonly structure?: LayoutKind
}

export interface MindMapDocument extends DocumentExtensions {
  readonly format: 'trelyx'
  readonly version: 1
  readonly id: string
  readonly title: string
  readonly rootId: string
  readonly topics: Readonly<Record<string, Topic>>
  readonly assets?: Readonly<Record<string, DocumentAsset>>
}

export type TopicContentCommand =
  | { readonly type: 'setTopicNotes'; readonly topicId: string; readonly notes: string }
  | {
      readonly type: 'setTopicImage'
      readonly topicId: string
      readonly asset: DocumentAsset
      readonly width: number
      readonly height: number
    }
  | { readonly type: 'removeTopicImage'; readonly topicId: string }
  | { readonly type: 'addTopicAttachment'; readonly topicId: string; readonly asset: DocumentAsset }
  | { readonly type: 'removeTopicAttachment'; readonly topicId: string; readonly assetId: string }

export interface TopicClipboard extends DocumentAnnotations {
  readonly format: 'trelyx.topics'
  readonly version: 1
  readonly roots: readonly string[]
  readonly topics: Readonly<Record<string, Topic>>
  readonly assets?: Readonly<Record<string, DocumentAsset>>
}

export type Command =
  | ExtensionCommand
  | { readonly type: 'batch'; readonly commands: readonly Command[] }
  | { readonly type: 'deleteTopics'; readonly topicIds: readonly string[] }
  | {
      readonly type: 'moveTopics'
      readonly topicIds: readonly string[]
      readonly parentId: string
      readonly index?: number
      readonly side?: Side
    }
  | {
      readonly type: 'pasteTopics'
      readonly parentId: string
      readonly clipboard: TopicClipboard
      readonly topicIds: Readonly<Record<string, string>>
      readonly assetIds: Readonly<Record<string, string>>
      readonly annotationIds?: Readonly<Record<string, string>>
    }
  | {
      readonly type: 'replaceTopicText'
      readonly topicId: string
      readonly query: string
      readonly replacement: string
      readonly field?: 'title' | 'notes'
      readonly matchCase?: boolean
      readonly wholeWord?: boolean
      readonly includeNotes?: boolean
    }
  | TopicContentCommand
  | {
      readonly type: 'addTopic'
      readonly parentId: string
      readonly id: string
      readonly title: string
      readonly index?: number
      readonly side?: Side
    }
  | { readonly type: 'renameTopic'; readonly topicId: string; readonly title: string }
  | {
      readonly type: 'insertParentTopic'
      readonly topicId: string
      readonly id: string
      readonly title: string
    }
  | { readonly type: 'removeTopicOnly'; readonly topicId: string }
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
