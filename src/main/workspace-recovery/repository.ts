import { createHash } from 'node:crypto'
import { z } from 'zod'

export const recoveryFileStem = (id: string): string =>
  createHash('sha256').update(id).digest('hex')
const entrySchema = z
  .object({
    documentId: z.string().min(1).max(4096),
    fileName: z
      .string()
      .regex(
        /^[a-f0-9]{64}\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.brainstorming$/u,
      ),
    protocolVersion: z.literal(2),
  })
  .strict()
  .refine((entry) => entry.fileName.startsWith(recoveryFileStem(entry.documentId) + '.'))
const entriesSchema = z
  .array(entrySchema)
  .max(32)
  .refine((entries) => new Set(entries.map((entry) => entry.documentId)).size === entries.length)
export type RecoveryEntry = z.infer<typeof entrySchema>
export interface RecoveryIndexRepository {
  read(): Promise<readonly RecoveryEntry[]>
  replace(entries: readonly RecoveryEntry[]): Promise<void>
}
export const validateRecoveryIndex = (entries: unknown): readonly RecoveryEntry[] => {
  try {
    return entriesSchema.parse(entries)
  } catch (cause) {
    throw new Error('工作区恢复索引损坏，请保留恢复目录后重试', { cause })
  }
}
