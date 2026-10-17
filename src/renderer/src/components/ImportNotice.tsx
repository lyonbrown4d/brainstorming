import { DialogContent } from '@renderer/components/DialogContent'
import { FileCheck2, X } from 'lucide-react'
import { useEditor } from '@renderer/state/editor'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui/dialog'

export const ImportNotice = () => {
  const report = useEditor((state) => state.importReport)
  const path = useEditor((state) => state.path)
  if (!report) return null
  return (
    <div className="import-banner" role="status">
      <FileCheck2 size={17} aria-hidden="true" />
      <span>
        已导入 {report.sourceName}，{path ? '已保存为 Trelyx 文件。' : '保存时将创建 Trelyx 文件。'}
        {report.warnings.length > 0 && ' 部分内容已调整或未导入。'}
      </span>
      {report.warnings.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              查看导入报告
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel="关闭导入报告">
            <DialogHeader>
              <DialogTitle>导入报告</DialogTitle>
              <DialogDescription>
                {report.sourceName} 已转换为可编辑的 Trelyx 文档。源文件保持原样，以下内容需要留意。
              </DialogDescription>
            </DialogHeader>
            <ul className="import-warning-list">
              {report.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="关闭导入提示"
        onClick={() => {
          useEditor.setState({ importReport: null })
        }}
      >
        <X size={15} />
      </Button>
    </div>
  )
}
