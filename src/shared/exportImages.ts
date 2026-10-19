import { z } from 'zod'

export type NativeImageFormat = 'png' | 'jpg' | 'webp' | 'svg'
export interface NativeImageExportRequest {
  readonly jobId: string
  readonly format: NativeImageFormat
  readonly suggestedName: string
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly scale?: number
  readonly jpegQuality?: number
}
export const imageExportProgressSchema = z.object({
  jobId: z.uuid(),
  stage: z.enum(['rendering', 'encoding', 'writing', 'done']),
  completed: z.number().int().nonnegative().optional(),
  total: z.number().int().positive().optional(),
})
export type ImageExportProgress = z.infer<typeof imageExportProgressSchema>
export interface ImageExportAPI {
  exportImage(request: NativeImageExportRequest): Promise<string | null>
  onExportProgress(callback: (progress: ImageExportProgress) => void): () => void
}
