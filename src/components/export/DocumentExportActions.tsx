import { ExternalLink, FolderOpen } from 'lucide-react'
import type { DocumentExportFormat } from '@shared/documentExports'
import { Button } from '@renderer/components/ui/button'
import { DialogClose, DialogFooter } from '@renderer/components/ui/dialog'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import { useMessages } from '@renderer/i18n/useMessages'

export const DocumentExportActions = ({
  busy,
  cancelling,
  canExport,
  resultPath,
  format,
  onCancel,
  onOpenResult,
}: {
  readonly busy: boolean
  readonly cancelling: boolean
  readonly canExport: boolean
  readonly resultPath: string | null
  readonly format: DocumentExportFormat
  readonly onCancel: () => void
  readonly onOpenResult: (reveal: boolean) => void
}) => {
  const { translate } = useMessages()
  return (
    <DialogFooter className="shrink-0 border-t border-border pt-4">
      {resultPath && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenResult(false)
            }}
          >
            <ExternalLink className="size-4" />
            {translate('exportOpenResult')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenResult(true)
            }}
          >
            <FolderOpen className="size-4" />
            {translate('exportRevealResult')}
          </Button>
        </>
      )}
      {busy ? (
        <Button type="button" variant="outline" disabled={cancelling} onClick={onCancel}>
          {translate('exportCancelJob')}
        </Button>
      ) : (
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {translate('close')}
          </Button>
        </DialogClose>
      )}
      <Button type="submit" disabled={!canExport}>
        {busy && <LoadingIndicator className="size-4" />}
        {busy
          ? translate('exporting')
          : translate('exportFormatAction', { format: format.toUpperCase() })}
      </Button>
    </DialogFooter>
  )
}
