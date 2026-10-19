export interface SheetPreviewImage {
  readonly sheetId: string
  readonly png: readonly number[]
}
export interface DocumentPreviewWrite {
  readonly documentId: string
  readonly revision: string
  readonly coverSheetId: string
  readonly sheets: readonly SheetPreviewImage[]
}
export interface DocumentPreviewAPI {
  getDocumentPreviewRevision(documentId: string, contents: string): Promise<string | null>
  writeDocumentPreviews(input: DocumentPreviewWrite): Promise<boolean>
}
