import { applyWorkbookCommand, createDocument, createExampleDocument, createWorkbook } from '@core'

export const exampleWorkbook = () => {
  let workbook = createWorkbook(createExampleDocument())
  const first = workbook.sheets[0]
  if (first)
    workbook = applyWorkbookCommand(workbook, {
      type: 'renameSheet',
      sheetId: first.id,
      name: '产品总览',
    })
  for (const [id, name] of [
    ['research-sheet', '用户研究'],
    ['plan-sheet', '迭代计划'],
  ] as const) {
    workbook = applyWorkbookCommand(workbook, {
      type: 'addSheet',
      sheet: { id, name, document: createDocument(name, id) },
    })
  }
  return workbook
}
