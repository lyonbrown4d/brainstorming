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
        trelyx: {
          url: connection.endpoint,
          headers: { Authorization: `Bearer ${connection.token}` },
        },
      },
    },
    null,
    2,
  )

export const MCPDialog = ({
  api = window.trelyx,
  defaultOpen = false,
}: {
  api?: MCPAPI
  defaultOpen?: boolean
}) => {
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
      setNotice(apply ? '已应用草稿，可一次撤销。' : '已拒绝草稿。')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '草稿处理失败')
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
          aria-label={pending.length ? `MCP 连接，${pending.length} 份待确认草稿` : 'MCP 连接'}
        >
          <Plug className="size-4" />
          MCP{pending.length ? ` · ${pending.length}` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>MCP 连接</DialogTitle>
          <DialogDescription>
            让外部 AI 客户端访问本次共享的工作簿。连接仅在 Trelyx 运行期间有效。
          </DialogDescription>
        </DialogHeader>
        {!api ? (
          <p role="status" className="text-sm">
            MCP 需要 Trelyx 桌面版。
          </p>
        ) : (
          <div className="grid gap-4">
            {query.isPending ? (
              <p role="status">正在读取连接状态…</p>
            ) : connection ? (
              <>
                <p role="status" className="text-sm">
                  MCP 已启用 · {connection.allowProposals ? '可提交编辑草稿' : '只读'}
                  {connection.includeNotes ? ' · 包含备注' : ''}
                </p>
                <p className="break-all text-xs text-muted-foreground">{connection.endpoint}</p>
                {connection.workbookId !== workbookId && (
                  <p role="alert" className="text-sm text-destructive">
                    当前工作簿已切换，外部读取已被拒绝。请停止后重新启用。
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
                    {showConfig ? '隐藏连接配置' : '显示连接配置'}
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
                    停止 MCP 服务
                  </Button>
                </div>
                {showConfig && (
                  <Label className="grid gap-2">
                    客户端连接配置
                    <Textarea
                      readOnly
                      aria-label="客户端连接配置"
                      value={clientConfig(connection)}
                      rows={12}
                      className="font-mono text-xs"
                    />
                    <span className="text-xs text-muted-foreground">
                      适用于支持 HTTP 与 headers
                      配置的客户端。配置包含本次访问令牌，请仅交给信任的客户端。
                    </span>
                  </Label>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">共享工作簿：{title}</p>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeNotes}
                    disabled={update.isPending}
                    onCheckedChange={(value) => {
                      setIncludeNotes(value === true)
                    }}
                  />
                  允许读取主题备注
                </Label>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={allowProposals}
                    disabled={update.isPending}
                    onCheckedChange={(value) => {
                      setAllowProposals(value === true)
                    }}
                  />
                  允许提交编辑草稿，由我确认后应用
                </Label>
                <p className="text-xs leading-5 text-muted-foreground">
                  默认只共享主题标题和层级，不共享图片、附件、音频或磁盘路径。启用后，持有令牌的客户端可以读取本工作簿全部画布的已提交内容；加密工作簿解锁后的内容也在共享范围内。
                </p>
                <Button
                  disabled={update.isPending}
                  onClick={() => {
                    update.mutate({ workbookId, includeNotes, allowProposals })
                  }}
                >
                  {update.isPending ? '正在启用…' : '启用本机 MCP 服务'}
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
            {pending.length > 0 && (
              <section className="grid gap-3" aria-label="待确认的 MCP 草稿">
                <p className="text-sm font-medium">待确认草稿 · {pending.length}</p>
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
