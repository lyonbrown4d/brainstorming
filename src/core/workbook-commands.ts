import { cleanupRemovedWorkbookTargets, remapSheetLinks } from '@core/workbook-links'
import { documentData } from '@core/document'
import type { MindMapSheet, MindMapWorkbook, WorkbookCommand } from '@core/types'
import { assertId, validateDocument } from '@core/validation'
import {
  assertSheetName,
  sheetData,
  truncateSheetName,
  validateSheet,
  validateWorkbook,
} from '@core/workbook'

const insertionIndex = (index: number | undefined, length: number): number => {
  const result = index ?? length
  if (!Number.isInteger(result) || result < 0 || result > length)
    throw new Error('画布位置超出范围')
  return result
}

const assertNewId = (workbook: MindMapWorkbook, id: string): void => {
  assertId(id)
  if (workbook.sheets.some((sheet) => sheet.id === id)) throw new Error(`画布 ${id} 已存在`)
}

/** One immutable workbook operation; each sheet retains its own topic-tree protocol. */
export const applyWorkbookCommand = (
  workbook: MindMapWorkbook,
  command: WorkbookCommand,
): MindMapWorkbook => {
  validateWorkbook(workbook)
  const sheets = [...workbook.sheets]
  if (command.type === 'addSheet') {
    validateSheet(command.sheet)
    assertNewId(workbook, command.sheet.id)
    sheets.splice(insertionIndex(command.index, sheets.length), 0, sheetData(command.sheet))
    const updated = { ...workbook, sheets }
    validateWorkbook(updated)
    return updated
  }
  const sourceIndex = sheets.findIndex((sheet) => sheet.id === command.sheetId)
  const sheet = sheets[sourceIndex]
  if (!sheet) throw new Error(`画布 ${command.sheetId} 不存在`)
  switch (command.type) {
    case 'renameSheet':
      assertSheetName(command.name)
      if (sheet.name === command.name) return workbook
      sheets[sourceIndex] = { ...sheet, name: command.name }
      break
    case 'duplicateSheet': {
      assertNewId(workbook, command.id)
      const suffix = ' 副本'
      const name = truncateSheetName(sheet.name, 77) + suffix
      const copy: MindMapSheet = {
        id: command.id,
        name,
        document: remapSheetLinks(
          { ...documentData(sheet.document), id: command.id },
          sheet.id,
          command.id,
        ),
      }
      sheets.splice(sourceIndex + 1, 0, copy)
      break
    }
    case 'deleteSheet':
      if (sheets.length === 1) throw new Error('不能删除最后一个画布')
      sheets.splice(sourceIndex, 1)
      break
    case 'moveSheet': {
      const index = insertionIndex(command.index, sheets.length - 1)
      if (index === sourceIndex) return workbook
      sheets.splice(sourceIndex, 1)
      sheets.splice(index, 0, sheet)
      break
    }
    case 'updateSheet':
      validateDocument(command.document)
      assertId(command.document.id)
      if (command.document === sheet.document) return workbook
      sheets[sourceIndex] = { ...sheet, document: documentData(command.document, true) }
      break
    default:
      throw new Error('不支持的画布命令')
  }
  const updated = cleanupRemovedWorkbookTargets(workbook, { ...workbook, sheets })
  validateWorkbook(updated)
  return updated
}
