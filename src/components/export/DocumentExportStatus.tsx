import type { DocumentExportProgress } from '@shared/documentExports'
import { DocumentExportStage } from '@shared/documentExports'
import { useMessages } from '@renderer/i18n/useMessages'

export const DocumentExportStatus = ({
  invalidDimensions,
  busy,
  cancelling,
  progress,
  message,
  failed,
}: {
  readonly invalidDimensions: boolean
  readonly busy: boolean
  readonly cancelling: boolean
  readonly progress: DocumentExportProgress | null
  readonly message: string
  readonly failed: boolean
}) => {
  const { translate } = useMessages()
  const stage =
    progress?.stage === DocumentExportStage.Choosing
      ? translate('exportChoosingLocation')
      : progress?.stage === DocumentExportStage.Rendering
        ? translate('exportRendering')
        : progress?.stage === DocumentExportStage.Encoding
          ? translate('exportEncoding')
          : progress?.stage === DocumentExportStage.Writing
            ? translate('exportWriting')
            : translate('exportGenerating')
  return (
    <>
      {invalidDimensions && (
        <p role="alert" className="text-xs text-destructive">
          {translate('exportInvalidDimensions')}
        </p>
      )}
      {busy && progress && (
        <p role="status" className="text-xs text-foreground">
          {translate('exportProgress', {
            stage: cancelling ? translate('exportCancelling') : stage,
            completed: progress.completed,
            total: progress.total,
          })}
        </p>
      )}
      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={`text-xs break-all ${failed ? 'text-destructive' : 'text-foreground'}`}
        >
          {message}
        </p>
      )}
    </>
  )
}
