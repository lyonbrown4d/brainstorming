import { applyCommand, type Command, type MindMapDocument } from '@core'
import { validateBoundedWorkbook } from '@formats/trelyx/validation'
import {
  MCP_LIMITS,
  mcpActionSchema,
  type MCPBridgeRequest,
  type MCPEdit,
  type MCPOperation,
  type MCPRead,
} from '@shared/mcp'
import { create } from 'zustand'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'

export interface MCPProposal {
  readonly id: string
  readonly sessionId: string
  readonly workbookId: string
  readonly input: MCPEdit
  readonly document: MindMapDocument
  readonly status: 'pending' | 'applied' | 'rejected' | 'stale'
}
export const useMCPProposals = create<{ proposals: readonly MCPProposal[] }>(() => ({
  proposals: [],
}))
const revisions = new WeakMap<MindMapDocument, string>()
const commandFor = (operation: MCPOperation): Command =>
  operation.type === 'moveTopic'
    ? {
        type: operation.type,
        topicId: operation.topicId,
        parentId: operation.parentId,
        ...(operation.index === undefined ? {} : { index: operation.index }),
      }
    : operation
const revisionFor = (document: MindMapDocument): string => {
  let revision = revisions.get(document)
  if (!revision) {
    revision = crypto.randomUUID()
    revisions.set(document, revision)
  }
  return revision
}
const documentFor = (sheetId: string): MindMapDocument => {
  const state = useEditor.getState()
  const sheet = state.workbook.sheets.find((entry) => entry.id === sheetId)
  if (!sheet) throw new Error('画布不存在')
  return sheet.document
}
const readBranch = (input: MCPRead, includeNotes: boolean): Record<string, unknown> => {
  const document = documentFor(input.sheetId)
  const revision = revisionFor(document)
  if (input.revision && input.revision !== revision) throw new Error('画布已改变，请重新读取')
  if (input.offset > 0 && !input.revision) throw new Error('分页读取须提供 revision')
  const rootId = input.topicId ?? document.rootId
  if (!document.topics[rootId]) throw new Error('主题不存在')
  const pending: { id: string; parentId: string | null }[] = [{ id: rootId, parentId: null }]
  const topics: Record<string, unknown>[] = []
  let index = 0
  while (pending.length && topics.length < input.limit) {
    const entry = pending.pop()
    if (!entry) break
    const topic = document.topics[entry.id]
    if (!topic) throw new Error('主题不存在')
    if (index++ >= input.offset)
      topics.push({
        id: topic.id,
        parentId: entry.parentId,
        title: topic.title,
        childCount: topic.children.length,
        collapsed: topic.collapsed,
        ...(includeNotes && topic.notes ? { notes: topic.notes } : {}),
      })
    for (let child = topic.children.length - 1; child >= 0; child--) {
      const childId = topic.children[child]
      if (childId) pending.push({ id: childId, parentId: topic.id })
    }
  }
  return {
    sheetId: input.sheetId,
    revision,
    rootId,
    topics,
    nextOffset: pending.length ? input.offset + topics.length : null,
  }
}
const validateEdit = (input: MCPEdit, document: MindMapDocument): void => {
  const candidate = applyCommand(document, {
    type: 'batch',
    commands: input.operations.map(commandFor),
  })
  const workbook = useEditor.getState().workbook
  validateBoundedWorkbook({
    ...workbook,
    sheets: workbook.sheets.map((sheet) =>
      sheet.id === input.sheetId ? { ...sheet, document: candidate } : sheet,
    ),
  })
}
export const handleMCPRequest = (request: MCPBridgeRequest): Record<string, unknown> => {
  const action = mcpActionSchema.parse(request.action)
  const state = useEditor.getState()
  if (!useWorkspace.getState().hasDocument || state.workbook.id !== request.grant.workbookId)
    throw new Error('共享的工作簿已关闭或切换，请在 Trelyx 中重新启用 MCP')
  if (action.type === 'workbook')
    return {
      workbookId: state.workbook.id,
      title: state.workbook.title,
      activeSheetId: state.activeSheetId,
      sheets: state.workbook.sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        rootId: sheet.document.rootId,
        revision: revisionFor(sheet.document),
      })),
    }
  if (action.type === 'read') return readBranch(action.input, request.grant.includeNotes)
  if (action.type === 'proposalStatus') {
    const proposal = useMCPProposals
      .getState()
      .proposals.find(
        (item) => item.id === action.proposalId && item.sessionId === request.sessionId,
      )
    if (!proposal) throw new Error('编辑草稿不存在或已过期')
    return { proposalId: proposal.id, status: proposal.status }
  }
  if (!request.grant.allowProposals) throw new Error('本次连接未授权提交编辑草稿')
  const document = documentFor(action.input.sheetId)
  if (revisionFor(document) !== action.input.revision) throw new Error('画布已改变，请重新读取')
  const proposals = useMCPProposals.getState().proposals
  if (proposals.filter((item) => item.status === 'pending').length >= MCP_LIMITS.proposals)
    throw new Error('待确认草稿已达上限，请先在 Trelyx 中处理')
  validateEdit(action.input, document)
  const proposal: MCPProposal = {
    id: crypto.randomUUID(),
    sessionId: request.sessionId,
    workbookId: state.workbook.id,
    input: action.input,
    document,
    status: 'pending',
  }
  useMCPProposals.setState({ proposals: [...proposals.slice(-19), proposal] })
  return {
    proposalId: proposal.id,
    status: proposal.status,
    message: '等待用户在 Trelyx 中确认；文档尚未修改',
  }
}
export const resolveMCPProposal = (
  proposalId: string,
  apply: boolean,
  sessionId?: string,
): void => {
  const proposal = useMCPProposals.getState().proposals.find((item) => item.id === proposalId)
  if (proposal?.status !== 'pending') return
  let status: MCPProposal['status'] = 'rejected'
  if (apply) {
    const state = useEditor.getState()
    if (state.editingId || state.busy || usePresentation.getState().playing)
      throw new Error('请先完成当前编辑、文件操作或演示')
    if (
      proposal.sessionId !== sessionId ||
      state.workbook.id !== proposal.workbookId ||
      !useWorkspace.getState().hasDocument ||
      state.workbook.sheets.find((sheet) => sheet.id === proposal.input.sheetId)?.document !==
        proposal.document
    ) {
      status = 'stale'
    } else {
      validateEdit(proposal.input, proposal.document)
      state.switchSheet(proposal.input.sheetId)
      if (
        !useEditor
          .getState()
          .command({ type: 'batch', commands: proposal.input.operations.map(commandFor) })
      )
        throw new Error('无法应用编辑草稿，文档未修改')
      status = 'applied'
    }
  }
  useMCPProposals.setState(({ proposals }) => ({
    proposals: proposals.map((item) => (item.id === proposalId ? { ...item, status } : item)),
  }))
  if (status === 'stale') throw new Error('草稿对应的连接或画布已改变，请重新提交')
}
