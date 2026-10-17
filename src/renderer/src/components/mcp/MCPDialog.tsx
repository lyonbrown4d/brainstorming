import { useMessages } from '@renderer/i18n/useMessages'

import { useState } from 'react'
import { Plug } from 'lucide-react'
import type { MCPAPI, MCPConnection } from '@shared/mcp'
import { useEditor } from '@renderer/state/editor'
import { useMCPServer } from '@renderer/hooks/useMCPServer'
import { resolveMCPProposal, useMCPProposals } from '@renderer/components/mcp/workspace'
import { MCPProposalCard } from '@renderer/components/mcp/MCPProposalCard'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

const clientConfig = (connection: MCPConnection): string =>
  JSON.stringify(
    {
      mcpServers: {
        brainstorming: {
          url: connection.endpoint,
          headers: { Authorization: `Bearer ${connection.token}` },
        },
      },
    },
    null,
    2,
  )

export const MCPDialog = ({
  api = window.brainstorming,
  defaultOpen = false,
}: {
  api?: MCPAPI
  defaultOpen?: boolean
}) => {
  const { translate } = useMessages()

  const [open, setOpen] = useState(defaultOpen)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [allowProposals, setAllowProposals] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [notice, setNotice] = useState('')
  const workbookId = useEditor((state) => state.workbook.id)
  const title = useEditor((state) => state.workbook.title)
  const proposals = useMCPProposals((state) => state.proposals)
  const pending = proposals.filter((proposal) => proposal.status === 'pending')
  const { connection: query, update } = useMCPServer(api, open)
  const connection = query.data
  const error = update.error ?? query.error
  const onResolve = (id: string, apply: boolean): void => {
    try {
      resolveMCPProposal(id, apply, connection?.sessionId)
      setNotice(apply ? translate('draftAppliedYouCanUndoThisAction') : translate('draftRejected'))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : translate('couldNotProcessDraft'))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        setShowConfig(false)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={
            pending.length
              ? translate('mcpConnectionValue0PendingDrafts', { value0: pending.length })
              : translate('mcpConnection')
          }
        >
          <Plug className="size-4" />
          MCP{pending.length ? ` · ${pending.length}` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{translate('mcpConnection')}</DialogTitle>
          <DialogDescription>{translate('allowExternalAiClientsToAccessThis')}</DialogDescription>
        </DialogHeader>
        {!api ? (
          <p role="status" className="text-sm">
            {translate('mcpRequiresTheBrainstormingDesktopApp')}
          </p>
        ) : (
          <div className="grid gap-4">
            {query.isPending ? (
              <p role="status">{translate('loadingConnectionStatus')}</p>
            ) : connection ? (
              <>
                <p role="status" className="text-sm">
                  {translate('mcpEnabled')}
                  {connection.allowProposals
                    ? translate('editingDraftsAllowed')
                    : translate('readOnly')}
                  {connection.includeNotes ? translate('includesNotes') : ''}
                </p>
                <p className="break-all text-xs text-muted-foreground">{connection.endpoint}</p>
                {connection.workbookId !== workbookId && (
                  <p role="alert" className="text-sm text-destructive">
                    {translate('theWorkbookChangedExternalAccessWasDenied')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowConfig(!showConfig)
                    }}
                  >
                    {showConfig
                      ? translate('hideConnectionSettings')
                      : translate('showConnectionSettings')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => {
                      setShowConfig(false)
                      update.mutate(null)
                    }}
                  >
                    {translate('stopMcpServer')}
                  </Button>
                </div>
                {showConfig && (
                  <Label className="grid gap-2">
                    {translate('clientConnectionSettings')}
                    <Textarea
                      readOnly
                      aria-label={translate('clientConnectionSettings')}
                      value={clientConfig(connection)}
                      rows={12}
                      className="font-mono text-xs"
                    />
                    <span className="text-xs text-muted-foreground">
                      {translate('forClientsSupportingHttpAndHeadersSettings')}
                    </span>
                  </Label>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">
                  {translate('sharedWorkbook')}
                  {title}
                </p>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeNotes}
                    disabled={update.isPending}
                    onCheckedChange={(value) => {
                      setIncludeNotes(value === true)
                    }}
                  />
                  {translate('allowReadingTopicNotes')}
                </Label>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={allowProposals}
                    disabled={update.isPending}
                    onCheckedChange={(value) => {
                      setAllowProposals(value === true)
                    }}
                  />
                  {translate('allowEditingDraftsForMyApproval')}
                </Label>
                <p className="text-xs leading-5 text-muted-foreground">
                  {translate('byDefaultOnlyTitlesAndHierarchyAre')}
                </p>
                <Button
                  disabled={update.isPending}
                  onClick={() => {
                    update.mutate({ workbookId, includeNotes, allowProposals })
                  }}
                >
                  {update.isPending ? translate('enabling') : translate('enableLocalMcpServer')}
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
            {pending.length > 0 && (
              <section className="grid gap-3" aria-label={translate('pendingMcpDrafts')}>
                <p className="text-sm font-medium">
                  {translate('pendingDraft')}
                  {pending.length}
                </p>
                {pending.map((proposal) => (
                  <MCPProposalCard key={proposal.id} proposal={proposal} onResolve={onResolve} />
                ))}
              </section>
            )}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
