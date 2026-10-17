import type { DocumentAsset, Side } from '@core/types'
export const LAYOUT_KINDS = [
  'map',
  'logic-right',
  'logic-left',
  'org-down',
  'org-up',
  'tree-down',
  'tree-up',
  'brace-right',
  'brace-left',
  'fishbone',
  'timeline',
  'timeline-vertical',
  'tree-table-right',
  'tree-table-down',
  'matrix',
] as const
export type LayoutKind = (typeof LAYOUT_KINDS)[number]
export type TopicLink =
  | {
      readonly kind: 'url'
      readonly url: string
    }
  | {
      readonly kind: 'topic'
      readonly topicId: string
      readonly sheetId?: string
    }
export interface TopicTask {
  readonly done: boolean
  readonly priority?: 1 | 2 | 3
  readonly progress?: number
  readonly start?: string
  readonly due?: string
  readonly assignee?: string
  readonly dependencies?: readonly string[]
}
export interface TopicMetadata {
  readonly labels?: readonly string[]
  readonly markers?: readonly string[]
  readonly markerStyle?: {
    readonly position?: 'top' | 'bottom' | 'left' | 'right'
    readonly size?: number
  }
  readonly link?: TopicLink
  readonly task?: TopicTask
  readonly equation?: string
  readonly audioAssetId?: string
  readonly notesFormat?: 'plain' | 'markdown'
  readonly richTitle?: string
}
export interface DocumentSettings {
  readonly layout?: LayoutKind
  readonly theme?:
    'brainstorming' | 'ocean' | 'forest' | 'sunset' | 'mono' | 'dawn' | 'paper' | 'night'
  readonly customPalette?: DocumentPalette
  readonly background?: string
  readonly fontFamily?: string
  readonly lineWidth?: number
}
export interface DocumentPalette {
  readonly name: string
  readonly root: string
  readonly branches: readonly [string, string, string, string, string]
  readonly background: string
}
export interface Relation {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly title?: string
  readonly color?: string
  readonly width?: number
  readonly dashed?: boolean
  readonly arrow?: 'none' | 'end' | 'both'
}
export interface TopicGroup {
  readonly id: string
  readonly topicIds: readonly string[]
  readonly title?: string
  readonly kind: 'boundary' | 'summary'
  readonly color?: string
}
export interface TopicCallout {
  readonly id: string
  readonly topicId: string
  readonly text: string
}
export interface FloatingPosition {
  readonly x: number
  readonly y: number
}
export interface PresentationStep {
  readonly topicId: string
  readonly camera?: {
    readonly position: readonly [number, number, number]
    readonly target: readonly [number, number, number]
  }
}
export interface DocumentAnnotations {
  readonly relations?: readonly Relation[]
  readonly groups?: readonly TopicGroup[]
  readonly callouts?: readonly TopicCallout[]
}
export interface DocumentExtensions extends DocumentAnnotations {
  readonly settings?: DocumentSettings
  readonly floatingIds?: readonly string[]
  readonly floatingPositions?: Readonly<Record<string, FloatingPosition>>
  /** Explicitly saved presentation steps, separate from transient camera/session state. */
  readonly presentation?: readonly PresentationStep[]
}
export type ExtensionCommand =
  | {
      readonly type: 'setTopicMetadata'
      readonly topicId: string
      readonly metadata: TopicMetadata
    }
  | {
      readonly type: 'setTopicStructure'
      readonly topicId: string
      readonly structure?: LayoutKind
    }
  | {
      readonly type: 'setTopicAudio'
      readonly topicId: string
      readonly asset: DocumentAsset
    }
  | {
      readonly type: 'setDocumentSettings'
      readonly settings: DocumentSettings
    }
  | {
      readonly type: 'upsertRelation'
      readonly relation: Relation
    }
  | {
      readonly type: 'removeRelation'
      readonly relationId: string
    }
  | {
      readonly type: 'upsertGroup'
      readonly group: TopicGroup
    }
  | {
      readonly type: 'removeGroup'
      readonly groupId: string
    }
  | {
      readonly type: 'upsertCallout'
      readonly callout: TopicCallout
    }
  | {
      readonly type: 'removeCallout'
      readonly calloutId: string
    }
  | {
      readonly type: 'addFloatingTopic'
      readonly id: string
      readonly title: string
      readonly x: number
      readonly y: number
    }
  | {
      readonly type: 'setFloatingPosition'
      readonly topicId: string
      readonly x: number
      readonly y: number
    }
  | {
      readonly type: 'attachFloatingTopic'
      readonly topicId: string
      readonly parentId: string
      readonly index?: number
      readonly side?: Side
    }
  | {
      readonly type: 'setPresentation'
      readonly steps: readonly PresentationStep[]
    }
