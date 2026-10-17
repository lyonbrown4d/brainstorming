import { getParentId, type MindMapDocument } from '@core'

import { topicAppearance } from '@shared/appearance'

export const branchColors = ['#e4878d', '#69b39e', '#e2ae54', '#9788d3', '#85a8c4']
export const branchFills = ['#ffc7c7', '#bcecdf', '#ffe0a3', '#d9d3fa', '#d2e4f3']
export const defaultTopicStyle = (document: MindMapDocument, id: string) => {
  const root = id === document.rootId
  const branch = getParentId(document, id) === document.rootId
  const appearance = topicAppearance(document, id)
  return {
    fill: appearance.fill,
    color: appearance.color,
    fontSize: root ? 24 : 16,
    bold: root || branch,
    lineWidth: appearance.lineWidth,
  }
}
