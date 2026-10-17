import { applyCommand, createDocument, type MindMapDocument } from '@core'

const templates = {
  brainstorm: {
    title: '头脑风暴',
    layout: 'map',
    branches: {
      目标: ['问题定义', '成功标准'],
      想法: ['自由联想', '候选方案'],
      评估: ['收益', '风险'],
      行动: ['负责人', '下一步'],
    },
  },
  project: {
    title: '项目计划',
    layout: 'logic-right',
    branches: {
      立项: ['目标与范围', '干系人'],
      准备: ['资源预算', '关键里程碑'],
      交付: ['任务分解', '验收标准'],
      复盘: ['结果评估', '改进建议'],
    },
  },
  swot: {
    title: 'SWOT 分析',
    layout: 'matrix',
    branches: {
      '优势 Strengths': ['核心能力', '独特资源'],
      '劣势 Weaknesses': ['能力缺口', '限制因素'],
      '机会 Opportunities': ['市场趋势', '潜在合作'],
      '威胁 Threats': ['竞争变化', '外部风险'],
    },
  },
  study: {
    title: '学习笔记',
    layout: 'org-down',
    branches: {
      核心概念: ['定义', '例子'],
      知识关联: ['已有知识', '应用场景'],
      疑问: ['待查资料', '进一步探索'],
      练习: ['练习任务', '学习复盘'],
    },
  },
} as const
export type TemplateId = keyof typeof templates
export const templateOptions = Object.entries(templates).map(([id, template]) => ({
  id: id as TemplateId,
  title: template.title,
  count: 13,
}))
export const createTemplate = (id: TemplateId): MindMapDocument => {
  const template = templates[id]
  let document = createDocument(template.title, crypto.randomUUID())
  document = applyCommand(document, {
    type: 'setDocumentSettings',
    settings: { layout: template.layout },
  })
  for (const [index, [title, children]] of Object.entries<readonly string[]>(
    template.branches,
  ).entries()) {
    const branchId = crypto.randomUUID()
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: document.rootId,
      id: branchId,
      title,
      side: index % 2 ? 'right' : 'left',
    })
    for (const child of children)
      document = applyCommand(document, {
        type: 'addTopic',
        parentId: branchId,
        id: crypto.randomUUID(),
        title: child,
      })
  }
  return document
}
