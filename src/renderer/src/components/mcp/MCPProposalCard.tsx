import { useMessages } from '@renderer/i18n/useMessages'
import type { MessageTranslator } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/button'
import { type MCPProposal } from '@renderer/components/mcp/workspace'

const describeOperations = (
  proposal: MCPProposal,
  translate: MessageTranslator,
): readonly string[] => {
  const names = new Map<string, string>()
  const topic = (id: string): string => names.get(id) ?? proposal.document.topics[id]?.title ?? id
  return proposal.input.operations.map((operation) => {
    switch (operation.type) {
      case 'addTopic': {
        const description = translate('addValue1BelowValue0', {
          value0: topic(operation.parentId),
          value1: operation.title,
        })
        names.set(operation.id, operation.title)
        return description
      }
      case 'renameTopic': {
        const description = translate('renameValue0ToValue1', {
          value0: topic(operation.topicId),
          value1: operation.title,
        })
        names.set(operation.topicId, operation.title)
        return description
      }
      case 'moveTopic':
        return translate('moveValue0BelowValue1value2', {
          value0: topic(operation.topicId),
          value1: topic(operation.parentId),
          value2:
            operation.index === undefined
              ? ''
              : translate('positionValue0', { value0: operation.index + 1 }),
        })
      case 'deleteTopic':
        return translate('deleteValue0AndAllItsChildren', { value0: topic(operation.topicId) })
      case 'setTopicNotes':
        return translate('updateNotesOnValue0Value1', {
          value0: topic(operation.topicId),
          value1: operation.notes || translate('clearNotes'),
        })
    }
  })
}
export const MCPProposalCard = ({
  proposal,
  onResolve,
}: {
  proposal: MCPProposal
  onResolve: (id: string, apply: boolean) => void
}) => {
  const { translate } = useMessages()
  return (
    <article className="grid gap-3 rounded-lg border p-3" aria-label={translate('mcpEditingDraft')}>
      <p className="text-sm font-medium break-words">{proposal.input.summary}</p>
      <ol className="max-h-48 list-decimal space-y-2 overflow-auto pl-5 text-xs whitespace-pre-wrap">
        {describeOperations(proposal, translate).map((description, index) => (
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
          {translate('rejectDraft')}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            onResolve(proposal.id, true)
          }}
        >
          {translate('approveAndApplyDraft')}
        </Button>
      </div>
    </article>
  )
}
