import { DOMImplementation, DOMParser, XMLSerializer, type Element } from '@xmldom/xmldom'
import type { MindMapWorkbook } from '@core'
import { validateBoundedWorkbook } from '@formats/brainstorming/validation'
import { xmlText } from '@formats/interchange/xml'
import { assertTextSize, outlineWorkbook, type OutlineTopic } from '@formats/interchange/outline'

const children = (element: Element) =>
  Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1)
export const decodeOpml = (text: string): MindMapWorkbook => {
  assertTextSize(text)
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('OPML 不允许 DTD 或实体声明')
  const parsed = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(`OPML XML 无效：${message}`)
    },
  }).parseFromString(text, 'text/xml')
  const root = parsed.documentElement
  if (root?.tagName !== 'opml') throw new Error('文件不是 OPML 大纲')
  const body = children(root).find((node) => node.tagName === 'body')
  if (!body) throw new Error('OPML 缺少 body')
  let count = 0
  const topic = (element: Element, depth: number): OutlineTopic => {
    if (depth > 128 || ++count > 20_000) throw new Error('大纲超过 128 层或 20000 个主题')
    if (element.tagName !== 'outline') throw new Error('OPML 包含无效的主题元素')
    return {
      title: element.getAttribute('text') ?? element.getAttribute('title') ?? '',
      children: children(element).map((child) => topic(child, depth + 1)),
      ...(element.hasAttribute('_note') ? { notes: element.getAttribute('_note') ?? '' } : {}),
    }
  }
  const roots = children(body)
  const brainstorming = root.getAttribute('brainstorming') === 'workbook-v1'
  const headTitle = root.getElementsByTagName('title')[0]?.textContent ?? '导入大纲'
  return outlineWorkbook(
    brainstorming
      ? roots.map((element) => {
          const nested = children(element)
          if (nested.length !== 1) throw new Error('Brainstorming OPML 画布须包含一个中心主题')
          const center = nested[0]
          if (!center) throw new Error('OPML 缺少中心主题')
          return { name: element.getAttribute('text') ?? '导入大纲', root: topic(center, 1) }
        })
      : [
          {
            name: headTitle,
            root:
              roots.length === 1 && roots[0]
                ? topic(roots[0], 1)
                : { title: headTitle, children: roots.map((element) => topic(element, 2)) },
          },
        ],
  )
}
export const encodeOpml = (workbook: MindMapWorkbook): string => {
  validateBoundedWorkbook(workbook)
  const document = new DOMImplementation().createDocument(null, 'opml', null)
  const root = document.documentElement
  if (!root) throw new Error('无法创建 OPML 文档')
  root.setAttribute('version', '2.0')
  root.setAttribute('brainstorming', 'workbook-v1')
  const head = document.createElement('head')
  const title = document.createElement('title')
  title.appendChild(document.createTextNode(xmlText(workbook.title)))
  head.appendChild(title)
  root.appendChild(head)
  const body = document.createElement('body')
  root.appendChild(body)
  for (const sheet of workbook.sheets) {
    const wrapper = document.createElement('outline')
    wrapper.setAttribute('text', xmlText(sheet.name))
    body.appendChild(wrapper)
    const visit = (id: string, parent: Element) => {
      const topic = sheet.document.topics[id]
      if (!topic) return
      const element = document.createElement('outline')
      element.setAttribute('text', xmlText(topic.title))
      if (topic.notes) element.setAttribute('_note', xmlText(topic.notes))
      parent.appendChild(element)
      for (const child of topic.children) visit(child, element)
    }
    visit(sheet.document.rootId, wrapper)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(document)}`
}
