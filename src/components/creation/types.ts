import type { LayoutKind } from '@core'
import type { TemplateId } from '@renderer/components/documents/templates'
import type { ReactNode } from 'react'

export type CreationLayout = LayoutKind | 'none'

export interface CreationRequest {
  readonly title: string
  readonly layout: CreationLayout
  readonly template: 'blank' | TemplateId
}

export interface CreationGalleryProps {
  readonly mode: 'document' | 'sheet'
  readonly onCreate: (request: CreationRequest) => boolean
  readonly onCancel?: () => void
  readonly cancelLabel?: string
  readonly onOpen?: () => void
  readonly onExample?: () => void
  readonly busy?: boolean
  readonly error?: string | null
  readonly draft?: CreationRequest
  readonly onDraftChange?: (draft: CreationRequest) => void
  readonly step?: 1 | 2
  readonly onStepChange?: (step: 1 | 2) => void
  readonly sidebar?: ReactNode
  readonly showHeader?: boolean
}
