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
    <div className="import-banner" role="status">
      <FileCheck2 size={17} aria-hidden="true" />
      <span>
        {translate('imported')}
        {report.sourceName}，
        {path ? translate('savedAsATrelyxFile') : translate('savingWillCreateATrelyxFile')}
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
                {translate('convertedToAnEditableTrelyxDocumentThe')}
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
