import { getParentId, type MindMapDocument } from '@core'

export const branchColors = ['#e4878d', '#69b39e', '#e2ae54', '#9788d3', '#85a8c4']
export const branchFills = ['#ffc7c7', '#bcecdf', '#ffe0a3', '#d9d3fa', '#d2e4f3']
export function defaultTopicStyle(document: MindMapDocument, id: string) {
  const root = id === document.rootId
  const branch = getParentId(document, id) === document.rootId
  const index = document.topics[document.rootId]?.children.indexOf(id) ?? 0
  return {
    fill: root
      ? '#7666c4'
      : branch
        ? (branchFills[index % branchFills.length] ?? '#d9d3fa')
        : '#fcfcfa',
    color: root ? '#ffffff' : '#30313b',
    fontSize: root ? 24 : 16,
    bold: root || branch,
    lineWidth: branch ? 3 : 2,
  }
}
