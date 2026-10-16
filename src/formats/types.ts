import type { MindMapWorkbook } from '../core'

export interface ImportedWorkbook {
  workbook: MindMapWorkbook
  warnings: readonly string[]
}

export interface DecodedFile extends ImportedWorkbook {
  imported: boolean
}
