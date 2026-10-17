import { Button } from '@renderer/components/ui/button'
import { type MCPProposal } from '@renderer/components/mcp/workspace'

const describeOperations = (proposal: MCPProposal): readonly string[] => {
  const names = new Map<string, string>()
  const topic = (id: string): string => names.get(id) ?? proposal.document.topics[id]?.title ?? id
  return proposal.input.operations.map((operation) => {
    switch (operation.type) {
      case 'addTopic': {
        const description = `在「${topic(operation.parentId)}」下新增「${operation.title}」`
        names.set(operation.id, operation.title)
        return description
      }
      case 'renameTopic': {
        const description = `将「${topic(operation.topicId)}」改为「${operation.title}」`
        names.set(operation.topicId, operation.title)
        return description
      }
      case 'moveTopic':
        return `将「${topic(operation.topicId)}」移至「${topic(operation.parentId)}」下${operation.index === undefined ? '' : `，位置 ${operation.index + 1}`}`
      case 'deleteTopic':
        return `删除「${topic(operation.topicId)}」及其全部子主题`
      case 'setTopicNotes':
        return `更新「${topic(operation.topicId)}」的备注：${operation.notes || '清空备注'}`
    }
  })
}
export const MCPProposalCard = ({
  proposal,
  onResolve,
}: {
  proposal: MCPProposal
  onResolve: (id: string, apply: boolean) => void
}) => (
  <article className="grid gap-3 rounded-lg border p-3" aria-label="MCP 编辑草稿">
    <p className="text-sm font-medium break-words">{proposal.input.summary}</p>
    <ol className="max-h-48 list-decimal space-y-2 overflow-auto pl-5 text-xs whitespace-pre-wrap">
      {describeOperations(proposal).map((description, index) => (
        <li className="break-words" key={index}>
          {description}
        </li>
      ))}
    </ol>
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          onResolve(proposal.id, false)
        }}
      >
        拒绝草稿
      </Button>
      <Button
        size="sm"
        onClick={() => {
          onResolve(proposal.id, true)
        }}
      >
        确认应用草稿
      </Button>
    </div>
  </article>
)
