import { applyCommand } from './commands'
import type { Command, HistoryState, MindMapDocument } from './types'
import { validateDocument } from './validation'

const HISTORY_LIMIT = 100

export function createHistory(document: MindMapDocument): HistoryState {
  validateDocument(document)
  return { document, past: [], future: [] }
}

export function executeCommand(history: HistoryState, command: Command): HistoryState {
  const document = applyCommand(history.document, command)
  if (document === history.document) return history
  return { document, past: [...history.past, history.document].slice(-HISTORY_LIMIT), future: [] }
}

export function undo(history: HistoryState): HistoryState {
  const document = history.past.at(-1)
  return document === undefined
    ? history
    : {
        document,
        past: history.past.slice(0, -1),
        future: [history.document, ...history.future],
      }
}

export function redo(history: HistoryState): HistoryState {
  const document = history.future[0]
  return document === undefined
    ? history
    : {
        document,
        past: [...history.past, history.document].slice(-HISTORY_LIMIT),
        future: history.future.slice(1),
      }
}
