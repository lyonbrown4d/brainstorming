import { useRef, useState } from 'react'
import type { MindMapWorkbook } from '@core'
import { Download } from 'lucide-react'
import {
  createExport,
  downloadExport,
  exportNotice,
  type ExportFormat,
  type ExportRequest,
} from '@renderer/export/files'
import { printSheet } from '@renderer/export/print'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'
import { FieldSelect } from '@renderer/components/FieldSelect'

const formats: readonly { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG 图片' },
  { value: 'svg', label: 'SVG 矢量图' },
  { value: 'pdf', label: 'PDF 文档' },
  { value: 'md', label: 'Markdown 大纲' },
  { value: 'opml', label: 'OPML 大纲' },
  { value: 'txt', label: '纯文本大纲' },
  { value: 'xmind', label: 'XMind 工作簿' },
]
export interface ExportDialogProps {
  workbook: MindMapWorkbook
  currentSheetId: string
  onExport?: (request: ExportRequest) => Promise<string | null>
  defaultOpen?: boolean
}
export const ExportDialog = ({
  workbook,
  currentSheetId,
  onExport = downloadExport,
  defaultOpen = false,
}: ExportDialogProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scope, setScope] = useState<'sheet' | 'workbook'>('sheet')
  const [collapsed, setCollapsed] = useState<'visible' | 'all'>('visible')
  const [scale, setScale] = useState<'0.5' | '1' | '2'>('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submitting = useRef(false)
  const diagram = ['png', 'svg', 'pdf'].includes(format)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next)
          setMessage('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Download className="size-4" />
          导出
        </Button>
      </DialogTrigger>
      <DialogContent
        className="gap-5"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>导出导图</DialogTitle>
          <DialogDescription>导出副本不会改变当前文档或保存路径。</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (submitting.current) return
            submitting.current = true
            setBusy(true)
            setMessage('')
            void createExport(workbook, {
              format,
              sheetId: currentSheetId,
              wholeWorkbook: !diagram && scope === 'workbook',
              includeCollapsed: collapsed === 'all',
              scale: Number(scale),
            })
              .then(onExport)
              .then((path) => {
                setMessage(path === null ? '已取消导出' : `已导出：${path}`)
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : '导出失败，请重试')
              })
              .finally(() => {
                submitting.current = false
                setBusy(false)
              })
          }}
        >
          <Label className="grid gap-2">
            文件格式
            <FieldSelect label="导出格式" value={format} options={formats} onChange={setFormat} />
          </Label>
          {!diagram && (
            <Label className="grid gap-2">
              导出范围
              <FieldSelect
                label="导出范围"
                value={scope}
                options={[
                  { value: 'sheet', label: '当前画布' },
                  { value: 'workbook', label: '全部画布' },
                ]}
                onChange={setScope}
              />
            </Label>
          )}
          {diagram && (
            <Label className="grid gap-2">
              折叠分支
              <FieldSelect
                label="折叠分支"
                value={collapsed}
                options={[
                  { value: 'visible', label: '保留当前折叠状态' },
                  { value: 'all', label: '展开全部主题' },
                ]}
                onChange={setCollapsed}
              />
            </Label>
          )}
          {(format === 'png' || format === 'pdf') && (
            <Label className="grid gap-2">
              图片倍率
              <FieldSelect
                label="图片倍率"
                value={scale}
                options={[
                  { value: '0.5', label: '0.5 倍' },
                  { value: '1', label: '1 倍' },
                  { value: '2', label: '2 倍' },
                ]}
                onChange={setScale}
              />
            </Label>
          )}
          <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
            {exportNotice[format]}
          </p>
          {message && (
            <p role="status" className="break-all text-sm">
              {message}
            </p>
          )}
          <DialogFooter>
            {diagram && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (submitting.current) return
                  const sheet = workbook.sheets.find((entry) => entry.id === currentSheetId)
                  if (!sheet) {
                    setMessage('打印的画布不存在')
                    return
                  }
                  submitting.current = true
                  setBusy(true)
                  setMessage('')
                  void printSheet(sheet.document, collapsed === 'all')
                    .then(() => {
                      setMessage('已打开系统打印窗口，可选择打印机、纸张或另存为 PDF')
                    })
                    .catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : '打印失败')
                    })
                    .finally(() => {
                      submitting.current = false
                      setBusy(false)
                    })
                }}
              >
                打印当前画布
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                关闭
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? '正在导出…' : '导出文件'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
