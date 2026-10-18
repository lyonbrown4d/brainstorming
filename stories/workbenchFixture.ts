import { applyCommand, createDocument } from '@core'

export const createWorkbenchDocument = () => {
  let document = createDocument('产品规划')
  const branches = [
    { id: 'research', title: '用户研究', side: 'left', children: ['访谈记录', '场景整理'] },
    { id: 'editor', title: '编辑体验', side: 'right', children: ['快捷键', '节点编辑'] },
    { id: 'design', title: '视觉设计', side: 'left', children: ['配色方案', '组件规范'] },
    { id: 'release', title: '版本发布', side: 'right', children: ['回归验证', '桌面发布'] },
  ] as const
  for (const branch of branches) {
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: branch.id,
      title: branch.title,
      side: branch.side,
    })
    branch.children.forEach((title, index) => {
      document = applyCommand(document, {
        type: 'addTopic',
        parentId: branch.id,
        id: `${branch.id}-${index}`,
        title,
        side: branch.side,
      })
    })
  }
  return document
}
