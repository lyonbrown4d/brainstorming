import type { PdfExportOptions, ExportContent } from '@shared/documentExports'
import { ExportContent as Content } from '@shared/documentExports'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useMessages } from '@renderer/i18n/useMessages'

export const DocumentExportPdfSettings = ({
  pdf,
  content,
  onChange,
}: {
  readonly pdf: PdfExportOptions
  readonly content: ExportContent
  readonly onChange: (pdf: PdfExportOptions) => void
}) => {
  const { translate } = useMessages()
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <Label className="grid gap-1 text-xs">
        {translate('exportPdfPaper')}
        <FieldSelect
          label={translate('exportPdfPaper')}
          value={pdf.paper}
          options={[
            { value: 'auto', label: translate('exportPaperAuto') },
            { value: 'a4', label: 'A4' },
            { value: 'a3', label: 'A3' },
            { value: 'letter', label: translate('exportPaperLetter') },
          ]}
          onChange={(paper) => {
            onChange({ ...pdf, paper })
          }}
        />
      </Label>
      <Label className="grid gap-1 text-xs">
        {translate('exportPdfOrientation')}
        <FieldSelect
          label={translate('exportPdfOrientation')}
          value={pdf.orientation}
          options={[
            { value: 'auto', label: translate('exportOrientationAuto') },
            { value: 'portrait', label: translate('exportPortrait') },
            { value: 'landscape', label: translate('exportLandscape') },
          ]}
          onChange={(orientation) => {
            onChange({ ...pdf, orientation })
          }}
        />
      </Label>
      <Label className="grid gap-1 text-xs">
        {translate('exportPdfMargin')}
        <Input
          type="number"
          min={0}
          max={50}
          step={1}
          value={pdf.marginMm}
          onChange={(event) => {
            onChange({ ...pdf, marginMm: Number(event.target.value) })
          }}
        />
      </Label>
      {pdf.paper !== 'auto' && content === Content.Map && (
        <Label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={pdf.paginate}
            onCheckedChange={(checked) => {
              onChange({ ...pdf, paginate: checked === true })
            }}
          />
          {translate('exportPdfPaginate')}
        </Label>
      )}
    </div>
  )
}
