import { isAbsolute } from 'node:path'
import type { OpenedDocument } from '@shared/contracts'
import { type DocumentFiles, validateOpenPath } from '@main/files'

/** The operating system supplies paths; the renderer can only consume this bounded slot. */
export class OpenFileRequests {
  private pending: string | null = null

  hasPending = (): boolean => {
    return this.pending !== null
  }

  enqueue = (path: string): boolean => {
    try {
      validateOpenPath(path)
      if (!isAbsolute(path)) return false
      this.pending = path
      return true
    } catch {
      return false
    }
  }

  enqueueArguments = (arguments_: readonly string[]): boolean => {
    const path = arguments_.find((argument) => {
      try {
        validateOpenPath(argument)
        return isAbsolute(argument)
      } catch {
        return false
      }
    })
    return path ? this.enqueue(path) : false
  }

  take = async (files: DocumentFiles): Promise<OpenedDocument | null> => {
    const path = this.pending
    this.pending = null
    return path ? files.openSelected(path) : null
  }
}
