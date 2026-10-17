import { z } from 'zod'

export const MCP_LIMITS = {
  bodyBytes: 128 * 1024,
  replyBytes: 256 * 1024,
  timeout: 10_000,
  topics: 200,
  operations: 50,
  proposals: 5,
} as const

const id = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value), 'ID 无效')
const title = z.string().trim().min(1).max(200)
export const mcpOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('addTopic'), parentId: id, id, title }),
  z.strictObject({ type: z.literal('renameTopic'), topicId: id, title }),
  z.strictObject({
    type: z.literal('moveTopic'),
    topicId: id,
    parentId: id,
    index: z.number().int().min(0).max(10_000).optional(),
  }),
  z.strictObject({ type: z.literal('deleteTopic'), topicId: id }),
  z.strictObject({ type: z.literal('setTopicNotes'), topicId: id, notes: z.string().max(12_000) }),
])
export const mcpReadSchema = z.strictObject({
  sheetId: id,
  topicId: id.optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(MCP_LIMITS.topics).default(100),
  revision: z.string().max(80).optional(),
})
export const mcpEditSchema = z.strictObject({
  sheetId: id,
  revision: z.string().min(1).max(80),
  summary: z.string().trim().min(1).max(300),
  operations: z.array(mcpOperationSchema).min(1).max(MCP_LIMITS.operations),
})
export const mcpStartSchema = z.strictObject({
  workbookId: id,
  includeNotes: z.boolean(),
  allowProposals: z.boolean(),
})
export type MCPOperation = z.infer<typeof mcpOperationSchema>
export type MCPRead = z.infer<typeof mcpReadSchema>
export type MCPEdit = z.infer<typeof mcpEditSchema>
export type MCPStart = z.infer<typeof mcpStartSchema>
export interface MCPConnection extends MCPStart {
  readonly sessionId: string
  readonly endpoint: string
  readonly token: string
}
export const mcpActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('workbook') }),
  z.strictObject({ type: z.literal('read'), input: mcpReadSchema }),
  z.strictObject({ type: z.literal('propose'), input: mcpEditSchema }),
  z.strictObject({ type: z.literal('proposalStatus'), proposalId: z.uuid() }),
])
export type MCPAction = z.infer<typeof mcpActionSchema>
export interface MCPBridgeRequest {
  readonly id: string
  readonly sessionId: string
  readonly grant: MCPStart
  readonly action: MCPAction
}
export type MCPBridgeReply =
  | { readonly id: string; readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly id: string; readonly ok: false; readonly error: string }
export interface MCPAPI {
  getMCPConnection(): Promise<MCPConnection | null>
  startMCPServer(input: MCPStart): Promise<MCPConnection>
  stopMCPServer(): Promise<void>
  onMCPRequest(callback: (request: MCPBridgeRequest) => void): () => void
  replyMCPRequest(reply: MCPBridgeReply): void
  onMCPConnectionChanged(callback: (connection: MCPConnection | null) => void): () => void
}
