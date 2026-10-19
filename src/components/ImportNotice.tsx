import { useMessages } from '@renderer/i18n/useMessages'

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
  const { translate } = useMessages()

  const report = useEditor((state) => state.importReport)
  const path = useEditor((state) => state.path)
  if (!report) return null
  return (
    <div
      className="import-banner z-[9] flex items-center gap-[15px] border-b border-border bg-accent px-6 py-2.5 text-[13px] text-accent-foreground"
      role="status"
    >
      <FileCheck2 size={17} aria-hidden="true" />
      <span className="flex-1">
        {translate('imported')}
        {report.sourceName}，
        {path
          ? translate('savedAsABrainstormingFile')
          : translate('savingWillCreateABrainstormingFile')}
        {report.warnings.length > 0 && translate('someContentWasAdjustedOrCouldNot')}
      </span>
      {report.warnings.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              {translate('viewImportReport')}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={translate('closeImportReport')}>
            <DialogHeader>
              <DialogTitle>{translate('importReport')}</DialogTitle>
              <DialogDescription>
                {report.sourceName}
                {translate('convertedToAnEditableBrainstormingDocumentThe')}
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[50vh] list-disc overflow-y-auto pl-5 text-[13px] leading-[1.8]">
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
        aria-label={translate('dismissImportNotice')}
        onClick={() => {
          useEditor.setState({ importReport: null })
        }}
      >
        <X size={15} />
      </Button>
    </div>
  )
}
