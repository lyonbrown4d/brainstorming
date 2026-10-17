import { beforeEach, describe, expect, it } from 'vitest'
import { applyCommand, createDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'
import {
  handleMCPRequest,
  resolveMCPProposal,
  useMCPProposals,
} from '@renderer/components/mcp/workspace'
import { mcpActionSchema, type MCPAction, type MCPBridgeRequest } from '@shared/mcp'

const request = (action: MCPAction, grant = {}): MCPBridgeRequest => ({
  id: crypto.randomUUID(),
  sessionId: 'test-session',
  grant: {
    workbookId: useEditor.getState().workbook.id,
    includeNotes: false,
    allowProposals: true,
    ...grant,
  },
  action,
})
const read = (offset = 0, revision?: string) =>
  handleMCPRequest(
    request({
      type: 'read',
      input: {
        sheetId: useEditor.getState().activeSheetId,
        offset,
        limit: 1,
        ...(revision ? { revision } : {}),
      },
    }),
  )
const propose = (operations: unknown[], revision = read().revision) =>
  handleMCPRequest(
    request(
      mcpActionSchema.parse({
        type: 'propose',
        input: {
          sheetId: useEditor.getState().activeSheetId,
          revision,
          summary: '整理工作项',
          operations,
        },
      }),
    ),
  )
beforeEach(() => {
  const document = applyCommand(createDocument('根主题', 'mcp-document'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'child', title: '子主题' },
      { type: 'setTopicNotes', topicId: 'root', notes: '仅明确授权时共享的备注' },
    ],
  })
  useEditor.getState().replace(document)
  useEditor.setState({ busy: false })
  usePresentation.setState({ playing: false })
  useMCPProposals.setState({ proposals: [] })
})

describe('MCP workbook scope and proposal command boundary', () => {
  it('applies only to the specified sheet and expires a proposal when its sheet is deleted', () => {
    const originalSheet = useEditor.getState().activeSheetId
    const originalDocument = useEditor.getState().history.document
    useEditor.getState().addSheet()
    const targetSheet = useEditor.getState().activeSheetId
    useEditor.getState().switchSheet(originalSheet)
    const target = (): Record<string, unknown> =>
      handleMCPRequest(
        request({
          type: 'read',
          input: {
            sheetId: targetSheet,
            offset: 0,
            limit: 1,
          },
        }),
      )
    const proposeToTarget = () =>
      handleMCPRequest(
        request(
          mcpActionSchema.parse({
            type: 'propose',
            input: {
              sheetId: targetSheet,
              revision: target().revision,
              summary: '指定画布草稿',
              operations: [{ type: 'renameTopic', topicId: 'root', title: '仅修改第二页' }],
            },
          }),
        ),
      )
    const first = proposeToTarget()
    resolveMCPProposal(String(first.proposalId), true, 'test-session')
    expect(useEditor.getState().activeSheetId).toBe(targetSheet)
    expect(useEditor.getState().history.document.title).toBe('仅修改第二页')
    expect(
      useEditor.getState().workbook.sheets.find((sheet) => sheet.id === originalSheet)?.document,
    ).toBe(originalDocument)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document.title).toBe('中心主题')
    const second = proposeToTarget()
    useEditor.getState().deleteSheet(targetSheet)
    expect(() => {
      resolveMCPProposal(String(second.proposalId), true, 'test-session')
    }).toThrow('已改变')
    expect(useMCPProposals.getState().proposals.at(-1)?.status).toBe('stale')
  })
  it('reads paged committed topics, includes collapsed descendants and excludes private content by default', () => {
    const first = read()
    expect(first).toMatchObject({ topics: [{ id: 'root', title: '根主题' }], nextOffset: 1 })
    expect(JSON.stringify(first)).not.toContain('备注')
    expect(read(1, String(first.revision))).toMatchObject({
      topics: [{ id: 'child' }],
      nextOffset: null,
    })
    expect(() => read(1)).toThrow('revision')
    const withNotes = handleMCPRequest(
      request(
        {
          type: 'read',
          input: {
            sheetId: useEditor.getState().activeSheetId,
            offset: 0,
            limit: 10,
          },
        },
        { includeNotes: true },
      ),
    )
    expect(JSON.stringify(withNotes)).toContain('仅明确授权时共享的备注')
    expect(withNotes).not.toHaveProperty('assets')
    useEditor.getState().command({ type: 'toggleCollapse', topicId: 'root' })
    expect(() => read(1, String(first.revision))).toThrow('已改变')
    expect(
      handleMCPRequest(
        request({
          type: 'read',
          input: {
            sheetId: useEditor.getState().activeSheetId,
            offset: 0,
            limit: 10,
          },
        }),
      ).topics,
    ).toHaveLength(2)
  })

  it('keeps a multi-operation proposal pending, then applies it as exactly one undoable edit', () => {
    const before = useEditor.getState().history.document
    const result = propose([
      { type: 'addTopic', parentId: 'root', id: 'mcp-added', title: '外部草稿主题' },
      { type: 'renameTopic', topicId: 'child', title: '修改后的标题' },
      { type: 'moveTopic', topicId: 'child', parentId: 'mcp-added' },
    ])
    expect(result.status).toBe('pending')
    expect(useEditor.getState().history.document).toBe(before)
    resolveMCPProposal(String(result.proposalId), true, 'test-session')
    expect(useEditor.getState().history.document.topics['mcp-added']?.children).toEqual(['child'])
    expect(useEditor.getState().history.document.topics.child?.title).toBe('修改后的标题')
    expect(useEditor.getState().history.past).toHaveLength(1)
    expect(
      handleMCPRequest(request({ type: 'proposalStatus', proposalId: String(result.proposalId) })),
    ).toMatchObject({ status: 'applied' })
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toBe(before)
    useEditor.getState().redo()
    expect(useEditor.getState().history.document.topics['mcp-added']).toBeDefined()
  })

  it('rejects invalid batches atomically, unknown fields, cycles and unapproved mutations', () => {
    const before = useEditor.getState().history.document
    expect(() =>
      propose([
        { type: 'renameTopic', topicId: 'child', title: '不能部分提交' },
        { type: 'moveTopic', topicId: 'root', parentId: 'child' },
      ]),
    ).toThrow()
    expect(() =>
      propose([{ type: 'addTopic', parentId: 'root', id: '__proto__', title: '保留 ID' }]),
    ).toThrow()
    expect(() =>
      propose([{ type: 'renameTopic', topicId: 'child', title: '标题', path: '/tmp/private' }]),
    ).toThrow()
    expect(useEditor.getState().history.document).toBe(before)
    expect(useMCPProposals.getState().proposals).toHaveLength(0)
    const input = mcpActionSchema.parse({
      type: 'propose',
      input: {
        sheetId: useEditor.getState().activeSheetId,
        revision: read().revision,
        summary: '无权限',
        operations: [{ type: 'deleteTopic', topicId: 'child' }],
      },
    })
    expect(() => handleMCPRequest(request(input, { allowProposals: false }))).toThrow('未授权')
  })

  it('does not overwrite edits, apply twice, or apply an expired session', () => {
    const operations = [{ type: 'renameTopic', topicId: 'child', title: '草稿标题' }]
    const first = propose(operations)
    useEditor.getState().command({ type: 'renameTopic', topicId: 'child', title: '用户刚编辑' })
    expect(() => {
      resolveMCPProposal(String(first.proposalId), true, 'test-session')
    }).toThrow('已改变')
    expect(useEditor.getState().history.document.topics.child?.title).toBe('用户刚编辑')
    const second = propose(operations)
    expect(() => {
      resolveMCPProposal(String(second.proposalId), true, 'expired-session')
    }).toThrow('已改变')
    const third = propose(operations)
    resolveMCPProposal(String(third.proposalId), false)
    resolveMCPProposal(String(third.proposalId), true, 'test-session')
    expect(useEditor.getState().history.document.topics.child?.title).toBe('用户刚编辑')
  })

  it('scopes access to an explicitly shared workbook and refuses applying during editing or presentation', () => {
    expect(() =>
      handleMCPRequest(request({ type: 'workbook' }, { workbookId: 'other-workbook' })),
    ).toThrow('关闭或切换')
    useWorkspace.setState({ hasDocument: false })
    expect(() => handleMCPRequest(request({ type: 'workbook' }))).toThrow('关闭或切换')
    useWorkspace.setState({ hasDocument: true })
    const result = propose([{ type: 'deleteTopic', topicId: 'child' }])
    useEditor.getState().startEdit('child')
    expect(() => {
      resolveMCPProposal(String(result.proposalId), true, 'test-session')
    }).toThrow('完成当前编辑')
    useEditor.getState().cancelEdit()
    usePresentation.setState({ playing: true })
    expect(() => {
      resolveMCPProposal(String(result.proposalId), true, 'test-session')
    }).toThrow('演示')
    expect(useEditor.getState().history.document.topics.child).toBeDefined()
  })
})
