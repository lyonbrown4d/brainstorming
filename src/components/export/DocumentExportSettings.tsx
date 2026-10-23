import type { MindMapWorkbook } from '@core'
import type { DocumentExportFormat, ExportPage } from '@shared/documentExports'
import { DocumentExportFormat as Format, ExportContent, ExportScope } from '@shared/documentExports'
import { FieldSelect } from '@renderer/components/FieldSelect'
import { DocumentExportPdfSettings } from '@renderer/components/export/DocumentExportPdfSettings'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useMessages } from '@renderer/i18n/useMessages'
import type { MessageKey } from '@renderer/i18n'
import {
  groups,
  type ExportGroup,
  type ExportPreferences,
} from '@renderer/components/export/documentOptions'

const formatKeys: Record<DocumentExportFormat, MessageKey> = {
  [Format.Png]: 'pngImage',
  [Format.Jpg]: 'exportJpeg',
  [Format.Webp]: 'exportWebp',
  [Format.Svg]: 'svgVector',
  [Format.Pdf]: 'pdfDocument',
  [Format.Pptx]: 'exportPptx',
  [Format.Docx]: 'exportDocx',
  [Format.Html]: 'exportHtml',
  [Format.Md]: 'markdownOutline',
  [Format.Opml]: 'opmlOutline',
  [Format.Txt]: 'plainTextOutline',
  [Format.Xmind]: 'xmindWorkbook',
  [Format.Csv]: 'exportCsv',
  [Format.Json]: 'exportJson',
}
const groupKeys: Record<ExportGroup, MessageKey> = {
  images: 'exportImagesGroup',
  documents: 'exportDocumentsGroup',
  presentation: 'exportPresentationGroup',
  interchange: 'exportInterchangeGroup',
}
const scopeKeys: Record<ExportScope, MessageKey> = {
  [ExportScope.Current]: 'exportCurrent',
  [ExportScope.All]: 'exportAll',
  [ExportScope.Sheets]: 'exportChosenSheets',
  [ExportScope.Topics]: 'exportSelectedTopics',
  [ExportScope.Branch]: 'exportBranch',
}

export const DocumentExportSettings = ({
  workbook,
  prefs,
  onChange,
  selectedSheets,
  onSelectedSheets,
  selectedTopics,
  preview,
  busy,
  viewAvailable,
}: {
  readonly workbook: MindMapWorkbook
  readonly prefs: ExportPreferences
  readonly onChange: (prefs: ExportPreferences) => void
  readonly selectedSheets: readonly string[]
  readonly onSelectedSheets: (ids: readonly string[]) => void
  readonly selectedTopics: number
  readonly preview: ExportPage | null
  readonly busy: boolean
  readonly viewAvailable: boolean
}) => {
  const { translate } = useMessages()
  const update = (patch: Partial<ExportPreferences>) => {
    onChange({ ...prefs, ...patch })
  }
  const visual = (
    [
      Format.Png,
      Format.Jpg,
      Format.Webp,
      Format.Svg,
      Format.Pdf,
      Format.Pptx,
    ] as readonly DocumentExportFormat[]
  ).includes(prefs.format)
  const raster = (
    [Format.Png, Format.Jpg, Format.Webp] as readonly DocumentExportFormat[]
  ).includes(prefs.format)
  const scaledWidth =
    preview && raster
      ? Math.ceil(preview.width * (prefs.scale === 'auto' ? 2 : Number(prefs.scale) || 1))
      : 0
  const scaledHeight =
    preview && raster
      ? Math.ceil(preview.height * (prefs.scale === 'auto' ? 2 : Number(prefs.scale) || 1))
      : 0
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-65">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
        {(Object.keys(groups) as ExportGroup[]).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={prefs.group === group}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${prefs.group === group ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              update({ group, format: groups[group][0] })
            }}
          >
            {translate(groupKeys[group])}
          </button>
        ))}
      </div>
      <Label className="grid gap-1.5 text-xs">
        {translate('fileFormat')}
        <FieldSelect
          label={translate('exportFormat')}
          value={prefs.format}
          options={groups[prefs.group].map((format) => ({
            value: format,
            label: translate(formatKeys[format]),
          }))}
          onChange={(format) => {
            update({ format })
          }}
        />
      </Label>
      {prefs.content !== ExportContent.View && (
        <Label className="grid gap-1.5 text-xs">
          {translate('exportScope')}
          <FieldSelect
            label={translate('exportScope')}
            value={prefs.scope}
            options={(Object.keys(scopeKeys) as ExportScope[]).map((scope) => ({
              value: scope,
              label: translate(scopeKeys[scope]),
            }))}
            onChange={(scope) => {
              update({ scope })
            }}
          />
        </Label>
      )}
      {prefs.scope === ExportScope.Sheets && (
        <div
          className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2"
          aria-label={translate('exportChosenSheets')}
        >
          {workbook.sheets.map((sheet) => (
            <Label key={sheet.id} className="flex items-center gap-2 py-1 text-xs">
              <Checkbox
                checked={selectedSheets.includes(sheet.id)}
                onCheckedChange={(checked) => {
                  onSelectedSheets(
                    checked
                      ? [...selectedSheets, sheet.id]
                      : selectedSheets.filter((id) => id !== sheet.id),
                  )
                }}
              />
              <span className="truncate">{sheet.name}</span>
            </Label>
          ))}
        </div>
      )}
      {(prefs.scope === ExportScope.Topics || prefs.scope === ExportScope.Branch) &&
        selectedTopics === 0 && (
          <p className="text-xs text-destructive">{translate('exportNoSelection')}</p>
        )}
      {visual && prefs.format !== Format.Pptx && (
        <Label className="grid gap-1.5 text-xs">
          {translate('exportFileContents')}
          <FieldSelect
            label={translate('exportFileContents')}
            value={prefs.content}
            options={[
              { value: ExportContent.Map, label: translate('exportMapContent') },
              { value: ExportContent.Presentation, label: translate('exportSlidesContent') },
              ...(viewAvailable &&
              [Format.Png, Format.Jpg, Format.Webp, Format.Pdf].some(
                (format) => format === prefs.format,
              )
                ? [{ value: ExportContent.View, label: translate('exportCurrentView') }]
                : []),
            ]}
            onChange={(content) => {
              update({ content })
            }}
          />
        </Label>
      )}
      {visual && prefs.content === ExportContent.Map && prefs.format !== Format.Pptx && (
        <Label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={prefs.includeCollapsed}
            onCheckedChange={(checked) => {
              update({ includeCollapsed: checked === true })
            }}
          />
          {translate('expandAllTopics')}
        </Label>
      )}
      {raster && (
        <div className="space-y-3 border-t border-border pt-3">
          <Label className="grid gap-1.5 text-xs">
            {translate('exportScale')}
            <FieldSelect
              label={translate('exportScale')}
              value={prefs.scale}
              options={[
                { value: 'auto', label: translate('exportQualityAuto') },
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
                { value: '3', label: '3×' },
                { value: 'custom', label: translate('exportCustomSize') },
              ]}
              onChange={(scale) => {
                update({ scale })
              }}
            />
          </Label>
          {prefs.scale === 'custom' ? (
            <div className="grid grid-cols-2 gap-2">
              <Label className="grid gap-1 text-xs">
                {translate('exportWidth')}
                <Input
                  inputMode="numeric"
                  value={prefs.width}
                  onChange={(event) => {
                    update({ width: event.target.value })
                  }}
                />
              </Label>
              <Label className="grid gap-1 text-xs">
                {translate('exportHeight')}
                <Input
                  inputMode="numeric"
                  value={prefs.height}
                  onChange={(event) => {
                    update({ height: event.target.value })
                  }}
                />
              </Label>
            </div>
          ) : scaledWidth > 0 && scaledHeight > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {translate('exportEstimate', {
                width: scaledWidth.toLocaleString(),
                height: scaledHeight.toLocaleString(),
              })}
            </p>
          ) : null}
          {prefs.format !== Format.Jpg && prefs.content !== ExportContent.View && (
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={prefs.transparent}
                onCheckedChange={(checked) => {
                  update({ transparent: checked === true })
                }}
              />
              {translate('exportTransparent')}
            </Label>
          )}
          {prefs.format === Format.Jpg && (
            <Label className="grid gap-1.5 text-xs">
              {translate('exportJpegQuality')}
              <Input
                inputMode="numeric"
                min={1}
                max={100}
                value={prefs.jpegQuality}
                onChange={(event) => {
                  update({ jpegQuality: event.target.value })
                }}
              />
            </Label>
          )}
        </div>
      )}
      {prefs.format === Format.Pdf && (
        <DocumentExportPdfSettings
          pdf={prefs.pdf}
          content={prefs.content}
          onChange={(pdf) => {
            update({ pdf })
          }}
        />
      )}
    </fieldset>
  )
}
