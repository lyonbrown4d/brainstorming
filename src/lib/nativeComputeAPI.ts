import { commands } from '@renderer/generated/native'
import type { MindMapWorkbook } from '@core'
import type { MindMapLayout } from '@layout'
import type { ComputeAPI, NativeEditorSnapshot } from '@shared/compute'

const wire = (value: object): Parameters<typeof commands.editorOpen>[1] =>
  value as unknown as Parameters<typeof commands.editorOpen>[1]
const snapshot = (
  value: Awaited<ReturnType<typeof commands.editorOpen>>,
): NativeEditorSnapshot => ({
  ...value,
  workbook: value.workbook as unknown as MindMapWorkbook,
})
const invoke = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}
/** Generated bindings are the only native command transport for compute operations. */
export const createComputeAPI = (): ComputeAPI => ({
  openSession: (id, workbook) =>
    invoke(async () => snapshot(await commands.editorOpen(id, wire(workbook)))),
  executeSession: (id, revision, operation) =>
    invoke(async () => snapshot(await commands.editorExecute(id, revision, wire(operation)))),
  closeSession: (id) =>
    invoke(async () => {
      await commands.editorClose(id)
    }),
  layout: (input) =>
    invoke(
      async () =>
        (await commands.computeLayout({
          document: wire(input.document),
          measurements: input.measurements.map((size) => ({ ...size })),
        })) as unknown as MindMapLayout,
    ),
  find: (input) =>
    invoke(async () =>
      (await commands.computeFind({ ...input, sheetId: input.sheetId ?? null })).map((match) => ({
        ...match,
        field: match.field === 'notes' ? 'notes' : 'title',
      })),
    ),
  renderSheet: (workbook, sheetId, includeCollapsed, geometry) =>
    invoke(async () => {
      const scene = await commands.computeRender({
        workbook: wire(workbook),
        sheetId,
        includeCollapsed,
        geometry: (geometry as Parameters<typeof commands.computeRender>[0]['geometry']) ?? null,
      })
      const { width, height } = scene
      if (
        width === null ||
        height === null ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 1 ||
        height < 1
      )
        throw new Error('原生导出尺寸无效')
      return { ...scene, width, height }
    }),
  exportFormat: (workbook, format, sheetId) =>
    invoke(() =>
      commands.computeExport({ workbook: wire(workbook), format, sheetId: sheetId ?? null }),
    ),
  refreshPreviews: (input) =>
    invoke(async () => {
      await commands.computePreviews(wire(input))
    }),
  importText: (format, text) =>
    invoke(
      async () => (await commands.computeImportText(format, text)) as unknown as MindMapWorkbook,
    ),
})
