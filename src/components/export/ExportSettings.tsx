import { useMessages } from '@renderer/i18n/useMessages'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { Label } from '@renderer/components/ui/label'
import {
  isDialogExportFormat,
  isVisualExport,
  type DialogExportFormat,
} from '@renderer/components/export/types'

export interface ExportSettingsProps {
  readonly format: DialogExportFormat
  readonly quality: string
  readonly jpegQuality: string
  readonly scope: string
  readonly collapsed: string
  readonly busy: boolean
  readonly sizeLabel: string | null
  readonly sizeWarning: string | null
  readonly onFormat: (value: DialogExportFormat) => void
  readonly onQuality: (value: string) => void
  readonly onJpegQuality: (value: string) => void
  readonly onScope: (value: string) => void
  readonly onCollapsed: (value: string) => void
}
export const ExportSettings = (props: ExportSettingsProps) => {
  const { translate } = useMessages()
  const visual = isVisualExport(props.format)
  const formats = [
    { value: 'png', label: translate('pngImage') },
    { value: 'jpg', label: translate('exportJpeg') },
    { value: 'webp', label: translate('exportWebp') },
    { value: 'svg', label: translate('svgVector') },
    { value: 'pdf', label: translate('pdfDocument') },
    { value: 'md', label: translate('markdownOutline') },
    { value: 'opml', label: translate('opmlOutline') },
    { value: 'txt', label: translate('plainTextOutline') },
    { value: 'xmind', label: translate('xmindWorkbook') },
  ]
  return (
    <fieldset
      disabled={props.busy}
      className="grid content-start gap-5 disabled:opacity-65 [&_button]:w-full"
    >
      <Label className="grid gap-2 text-xs">
        {translate('fileFormat')}
        <FieldSelect
          label={translate('exportFormat')}
          value={props.format}
          options={formats}
          onChange={(value) => {
            if (isDialogExportFormat(value)) props.onFormat(value)
          }}
        />
      </Label>
      {visual ? (
        <Label className="grid gap-2 text-xs">
          {translate('collapsedBranches')}
          <FieldSelect
            label={translate('collapsedBranches')}
            value={props.collapsed}
            options={[
              { value: 'visible', label: translate('keepCollapsedState') },
              { value: 'all', label: translate('expandAllTopics') },
            ]}
            onChange={props.onCollapsed}
          />
        </Label>
      ) : (
        <Label className="grid gap-2 text-xs">
          {translate('exportScope')}
          <FieldSelect
            label={translate('exportScope')}
            value={props.scope}
            options={[
              { value: 'sheet', label: translate('currentSheet') },
              { value: 'workbook', label: translate('allSheetsLabel508') },
            ]}
            onChange={props.onScope}
          />
        </Label>
      )}
      {visual && props.format !== 'svg' && (
        <Label className="grid gap-2 text-xs">
          {translate('exportQuality')}
          <FieldSelect
            label={translate('exportQuality')}
            value={props.quality}
            options={[
              { value: 'auto', label: translate('exportQualityAuto') },
              { value: '1', label: translate('exportQuality1') },
              { value: '2', label: translate('exportQuality2') },
              { value: '3', label: translate('exportQuality3') },
            ]}
            onChange={props.onQuality}
          />
        </Label>
      )}
      {props.format === 'jpg' && (
        <Label className="grid gap-2 text-xs">
          {translate('exportJpegQuality')}
          <FieldSelect
            label={translate('exportJpegQuality')}
            value={props.jpegQuality}
            options={[
              { value: '85', label: '85%' },
              { value: '92', label: translate('exportJpegRecommended') },
              { value: '98', label: '98%' },
            ]}
            onChange={props.onJpegQuality}
          />
        </Label>
      )}
      {visual && (
        <div className="space-y-2 border-t border-border pt-4">
          <dl className="space-y-1 text-xs">
            <dt className="text-muted-foreground">{translate('exportPixelSize')}</dt>
            <dd className="font-medium tabular-nums">{props.sizeLabel ?? '—'}</dd>
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">{translate('exportFullSheet')}</p>
          {props.sizeWarning && (
            <p className="text-xs leading-5 text-muted-foreground">{props.sizeWarning}</p>
          )}
        </div>
      )}
    </fieldset>
  )
}
