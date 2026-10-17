import { isAbsolute, resolve } from 'node:path'
import type { OpenedDocument } from '@shared/contracts'
import { type DocumentFiles, validateOpenPath } from '@main/files'

/** The operating system supplies paths; the renderer can only consume this bounded queue. */
export class OpenFileRequests {
  private readonly pending: string[] = []

  hasPending = (): boolean => {
    return this.pending.length > 0
  }

  enqueue = (path: string): boolean => {
    try {
      validateOpenPath(path)
      if (!isAbsolute(path)) return false
      const absolute = resolve(path)
      if (this.pending.length >= 32 || this.pending.includes(absolute)) return false
      this.pending.push(absolute)
      return true
    } catch {
      return false
    }
  }

  enqueueArguments = (arguments_: readonly string[]): boolean => {
    let accepted = false
    for (const argument of arguments_) {
      if (this.enqueue(argument)) accepted = true
    }
    return accepted
  }

  take = async (files: Pick<DocumentFiles, 'openSelected'>): Promise<OpenedDocument | null> => {
    const path = this.pending.shift()
    return path ? files.openSelected(path) : null
  }
}
