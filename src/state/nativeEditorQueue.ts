import type { MindMapWorkbook } from '@core'
import { getPlatformAPI } from '@renderer/lib/desktop'
import type { EditorOperation, NativeEditorSnapshot } from '@shared/compute'
import { clearNativeSheetHistory } from '@renderer/state/nativeSheetHistory'

interface PendingSession {
  readonly id: string
  revision: string | null
  tail: Promise<void>
  pending: number
  failed: Error | null
}

const sessions = new Map<string, PendingSession>()
const closing = new Map<string, Promise<void>>()

export const hasNativeEditor = (): boolean => getPlatformAPI()?.compute != null

export const hasPendingNativeEditor = (workbookId?: string): boolean =>
  workbookId === undefined
    ? [...sessions.values()].some((session) => session.pending > 0)
    : (sessions.get(workbookId)?.pending ?? 0) > 0

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

/** The input workbook is captured before the first edit; later edits use the Rust revision. */
export const queueNativeEditor = (
  workbook: MindMapWorkbook,
  operation: EditorOperation,
  onSnapshot: (snapshot: NativeEditorSnapshot, previousRevision: string) => void,
  onError: (error: Error) => void,
  onSettled?: () => void,
): boolean => {
  const compute = getPlatformAPI()?.compute
  if (!compute) return false
  let session = sessions.get(workbook.id)
  if (!session) {
    session = { id: workbook.id, revision: null, tail: Promise.resolve(), pending: 0, failed: null }
    sessions.set(workbook.id, session)
  }
  if (session.failed) {
    if (session.pending > 0) {
      onError(session.failed)
      return false
    }
    // A new explicit edit reopens the authoritative session to recover its revision.
    // Previously queued dependent edits remain skipped; native history is retained.
    session.failed = null
    session.revision = null
  }
  const target = session
  target.pending += 1
  target.tail = target.tail
    .then(async () => {
      if (target.failed) return
      try {
        if (target.revision === null) {
          await closing.get(target.id)
          const opened = await compute.openSession(target.id, workbook)
          target.revision = opened.revision
        }
        const previousRevision = target.revision
        const next = await compute.executeSession(target.id, previousRevision, operation)
        target.revision = next.revision
        onSnapshot(next, previousRevision)
      } catch (error) {
        target.failed = asError(error)
        onError(target.failed)
      }
    })
    .finally(() => {
      target.pending -= 1
      onSettled?.()
    })
  return true
}

const drainSession = async (session: PendingSession): Promise<void> => {
  for (;;) {
    const tail = session.tail
    await tail
    if (tail === session.tail) break
  }
  if (session.failed) throw session.failed
}

/** Include commands appended while the caller was waiting, including a replaced session. */
export const flushNativeEditor = async (workbookId?: string): Promise<void> => {
  for (;;) {
    const targets = [...sessions.values()].filter(
      (session) => workbookId === undefined || session.id === workbookId,
    )
    await Promise.all(targets.map(drainSession))
    const current = [...sessions.values()].filter(
      (session) => workbookId === undefined || session.id === workbookId,
    )
    if (current.every((session) => targets.includes(session) && session.pending === 0)) return
  }
}

export const releaseNativeEditor = async (workbookId: string): Promise<void> => {
  const session = sessions.get(workbookId)
  if (!session) return
  const compute = getPlatformAPI()?.compute
  sessions.delete(workbookId)
  const released = session.tail
    .then(async () => {
      await compute?.closeSession(session.id)
    })
    .finally(() => {
      clearNativeSheetHistory(workbookId)
    })
  closing.set(workbookId, released)
  try {
    await released
  } finally {
    if (closing.get(workbookId) === released) closing.delete(workbookId)
  }
}

/** Replacing a document must drain and close its old native state before reusing the ID. */
export const forgetNativeEditor = (workbookId: string): void => {
  void releaseNativeEditor(workbookId).catch(() => undefined)
}
