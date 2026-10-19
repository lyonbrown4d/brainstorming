/** Only text from currently open, unlocked workbooks enters the ephemeral native index. */
export interface ContentIndexTopic {
  readonly sheetId: string
  readonly sheetName: string
  readonly topicId: string
  readonly title: string
  readonly notes: string
}

export interface ContentIndexWorkbook {
  readonly workbookId: string
  readonly title: string
  readonly topics: readonly ContentIndexTopic[]
}

export interface ContentIndexSync {
  readonly upserts: readonly ContentIndexWorkbook[]
  readonly retainedWorkbookIds: readonly string[]
}

export interface ContentSearchInput {
  readonly query: string
  readonly limit?: number
}

export interface ContentSearchResult {
  readonly workbookId: string
  readonly workbookTitle: string
  readonly sheetId: string
  readonly sheetName: string
  readonly topicId: string
  readonly title: string
  readonly snippet: string
}

export interface ContentSearchAPI {
  syncContentIndex(input: ContentIndexSync): Promise<void>
  searchContent(input: ContentSearchInput): Promise<readonly ContentSearchResult[]>
}
