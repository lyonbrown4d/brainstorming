import type { LayoutKind } from '@core'
import type { TemplateId } from '../documents/templates'

export interface CreationRequest {
  readonly title: string
  readonly layout: LayoutKind
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
}
