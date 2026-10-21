import type { DocumentAsset, Side } from '@core/types'
import type { CanvasStroke, DrawingCommand } from '@core/ink'
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
export const TASK_PRIORITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export interface TopicTask {
  readonly done?: boolean
  readonly priority?: TaskPriority
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
export type SheetVisualStyle = 'normal' | 'sketch'
export interface SpatialSettings {
  readonly mode: '2d' | '3d'
  readonly yaw: number
  readonly pitch: number
  readonly spacing: number
  readonly target?: { readonly x: number; readonly y: number; readonly z: number }
}
export interface DocumentSettings {
  readonly visualStyle?: SheetVisualStyle
  readonly layout?: LayoutKind
  readonly theme?:
    'brainstorming' | 'ocean' | 'forest' | 'sunset' | 'mono' | 'dawn' | 'paper' | 'night'
  readonly customPalette?: DocumentPalette
  readonly background?: string
  readonly fontFamily?: string
  readonly lineWidth?: number
  readonly spatial?: SpatialSettings
}
export interface DocumentPalette {
  readonly name: string
  readonly root: string
  readonly branches: readonly [string, string, string, string, string]
  readonly background: string
}
export interface RelationPoint {
  readonly x: number
  readonly y: number
}
export type RelationAnchor = 'top' | 'right' | 'bottom' | 'left'
export interface Relation {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly title?: string
  readonly color?: string
  readonly width?: number
  readonly dashed?: boolean
  readonly arrow?: 'none' | 'end' | 'both'
  readonly routing?: 'straight' | 'curve' | 'orthogonal'
  readonly sourceAnchor?: RelationAnchor
  readonly targetAnchor?: RelationAnchor
  /** Control and bend coordinates are offsets from the endpoints' midpoint. */
  readonly controlPoints?: readonly RelationPoint[]
  readonly waypoints?: readonly RelationPoint[]
  readonly labelOffset?: RelationPoint
}
export interface TopicGroup {
  readonly id: string
  readonly topicIds: readonly string[]
  readonly title?: string
  readonly kind: 'boundary' | 'summary'
  /** Real, editable topic whose independent subtree is anchored to this summary. */
  readonly summaryTopicId?: string
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
  readonly layout?: 'auto' | 'list' | 'image' | 'structure'
  readonly hidden?: boolean
  readonly notes?: string
  readonly reveal?: 'all' | 'items'
  /** Legacy file compatibility. Slide playback does not move the canvas camera. */
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
  readonly drawings?: readonly CanvasStroke[]
  readonly settings?: DocumentSettings
  readonly floatingIds?: readonly string[]
  readonly floatingPositions?: Readonly<Record<string, FloatingPosition>>
  /** Explicitly saved presentation steps, separate from transient camera/session state. */
  readonly presentation?: readonly PresentationStep[]
}
export type ExtensionCommand =
  | DrawingCommand
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
