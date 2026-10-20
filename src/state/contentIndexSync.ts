import { debounce } from 'lodash-es'
import type { MindMapWorkbook } from '@core'
import type { ContentIndexWorkbook, ContentSearchAPI } from '@shared/contentSearch'
import { useEditor } from '@renderer/state/editor'
import { isSwitchingDocument, useDocumentTabs } from '@renderer/state/documentTabs'

interface IndexedWorkbook {
  readonly source: MindMapWorkbook
  input?: ContentIndexWorkbook
}

// A stable queue also orders disposal against a subsequent Strict Mode mount.
let nativeSyncQueue: Promise<void> = Promise.resolve()
const queueSync = (operation: () => Promise<void>): Promise<void> => {
  const result = nativeSyncQueue.then(operation)
  nativeSyncQueue = result.catch(() => undefined)
  return result
}
const indexWorkbook = (workbook: MindMapWorkbook): ContentIndexWorkbook => ({
  workbookId: workbook.id,
  title: workbook.title,
  topics: workbook.sheets.flatMap((sheet) =>
    Object.values(sheet.document.topics).map((topic) => ({
      sheetId: sheet.id,
      sheetName: sheet.name,
      topicId: topic.id,
      title: topic.title,
      notes: topic.notes ?? '',
    })),
  ),
})
const sameWorkbooks = (
  left: ReadonlyMap<string, IndexedWorkbook>,
  right: ReadonlyMap<string, IndexedWorkbook>,
): boolean =>
  left.size === right.size &&
  [...left].every(([id, entry]) => right.get(id)?.source === entry.source)

export const createContentIndexSync = (api: ContentSearchAPI, onChanged?: () => void) => {
  let alive = true
  let desired = new Map<string, IndexedWorkbook>()
  let synchronized = new Map<string, IndexedWorkbook>()
  let revision = 0
  let queuedRevision = -1
  let latest: Promise<void> = Promise.resolve()
  const enqueue = (): void => {
    if (!alive || queuedRevision === revision) return
    queuedRevision = revision
    const target = desired
    latest = queueSync(async () => {
      const upserts = [...target.values()]
        .filter((entry) => synchronized.get(entry.source.id)?.source !== entry.source)
        .map((entry) => (entry.input ??= indexWorkbook(entry.source)))
      await api.syncContentIndex({ upserts, retainedWorkbookIds: [...target.keys()] })
      // A failed native transaction never advances this baseline.
      synchronized = target
    })
    // Background errors stay on latest for the querying UI to surface.
    void latest.catch(() => undefined)
  }
  const schedule = debounce(enqueue, 180)
  const refresh = (): void => {
    if (!alive || isSwitchingDocument()) return
    const { tabs, activeId } = useDocumentTabs.getState()
    const editor = useEditor.getState()
    const next = new Map<string, IndexedWorkbook>()
    for (const tab of tabs) {
      const source =
        tab.id === activeId && editor.workbook.id === tab.editor.workbook.id
          ? editor.workbook
          : tab.editor.workbook
      const previous = desired.get(source.id)
      next.set(source.id, previous?.source === source ? previous : { source })
    }
    if (sameWorkbooks(desired, next)) return
    desired = next
    revision += 1
    schedule()
    onChanged?.()
  }
  const unsubscribeEditor = useEditor.subscribe(refresh)
  const unsubscribeTabs = useDocumentTabs.subscribe(refresh)
  refresh()
  enqueue()
  return {
    api,
    get alive(): boolean {
      return alive
    },
    get revision(): number {
      refresh()
      return revision
    },
    flush: async (): Promise<void> => {
      for (;;) {
        refresh()
        schedule.cancel()
        enqueue()
        const targetRevision = revision
        try {
          await latest
        } catch (error) {
          // Surface this failure once; an explicit retry may resubmit the same snapshot.
          if (targetRevision === revision) queuedRevision = -1
          throw error
        }
        refresh()
        if (targetRevision === revision) return
      }
    },
    dispose: (): void => {
      if (!alive) return
      alive = false
      schedule.cancel()
      unsubscribeEditor()
      unsubscribeTabs()
      void queueSync(() => api.syncContentIndex({ upserts: [], retainedWorkbookIds: [] })).catch(
        () => undefined,
      )
    },
  }
}
