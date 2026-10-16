import { XMLParser } from 'fast-xml-parser'
import { DOMParser, onWarningStopParsing } from '@xmldom/xmldom'
import { record, text, type SourceRecord, type Warnings } from './common'
import { legacyStyleMap } from './styles'

function many(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? (value as unknown[]) : [value]
}

function xmlText(value: unknown): string {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : text(record(value, 'XML 文本')['#text'], 'XML 文本')
}

function parseXml(xml: string): SourceRecord {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('XMind XML 不允许 DOCTYPE 或实体声明')
  // Bound nesting before passing untrusted input into the third-party XML parser.
  const markup = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, '')
  let depth = 0
  let count = 0
  for (const match of markup.matchAll(/<(?:[^'"<>]|"[^"]*"|'[^']*')*>/g)) {
    const tag = match[0]
    if (tag.startsWith('</')) depth--
    else if (!tag.endsWith('/>') && !tag.startsWith('<!')) depth++
    if (depth > 512 || ++count > 200_000) throw new Error('XMind XML 结构超出安全限制')
  }
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(markup))
    throw new Error('XMind XML 包含未定义或无效的实体引用')
  for (const match of markup.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
    const raw = match[1] ?? ''
    const code = raw.startsWith('x') ? Number.parseInt(raw.slice(1), 16) : Number(raw)
    if (
      ![9, 10, 13].includes(code) &&
      !(code >= 32 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    )
      throw new Error('XMind XML 包含无效的字符实体')
  }
  try {
    new DOMParser({ onError: onWarningStopParsing }).parseFromString(xml, 'application/xml')
  } catch (cause) {
    throw new Error('XMind content.xml 格式无效', { cause })
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
  })
  return record(parser.parse(xml) as unknown, 'XML')
}

export function parseLegacy(
  xml: string,
  stylesXml: string | undefined,
  warnings: Warnings,
): unknown[] {
  const content = record(parseXml(xml)['xmap-content'], 'xmap-content')
  const styles = stylesXml
    ? legacyStyleMap(record(parseXml(stylesXml)['xmap-styles'], 'xmap-styles'))
    : new Map<string, unknown>()
  let topicCount = 0
  const convertTopic = (value: unknown, depth: number): SourceRecord => {
    if (depth >= 128 || ++topicCount > 20_000) throw new Error('XMind XML 主题数量或层级超出限制')
    const source = record(value, 'XML 主题')
    const children: SourceRecord = {}
    if (source.children !== undefined) {
      for (const entry of many(record(source.children, 'XML children').topics)) {
        const group = record(entry, 'XML topics')
        const kind = text(group.type, 'XML topics.type', 'attached')
        const topics = many(group.topic).map((child) => convertTopic(child, depth + 1))
        // Map hostile keys as own data properties, never through Object.prototype setters.
        Object.defineProperty(children, kind, {
          value: [...many(Object.hasOwn(children, kind) ? children[kind] : undefined), ...topics],
          enumerable: true,
          configurable: true,
        })
      }
    }
    const result: SourceRecord = {
      id: source.id,
      title: xmlText(source.title),
      children,
      ...(source.branch !== undefined ? { branch: source.branch } : {}),
      ...(source['structure-class'] !== undefined
        ? { structureClass: source['structure-class'] }
        : {}),
    }
    const styleId = source['style-id']
    if (typeof styleId === 'string') {
      const style = styles.get(styleId)
      if (style) result.style = style
      else warnings.add('未找到 XMind 引用的样式，已使用默认样式')
    }
    warnings.omitted(
      source,
      new Set([
        'id',
        'title',
        'children',
        'branch',
        'structure-class',
        'style-id',
        'timestamp',
        'modified-by',
        'xmlns',
      ]),
    )
    return result
  }
  const sourceSheets = many(content.sheet)
  if (sourceSheets.length > 128) throw new Error('XMind 画布数超过 128')
  return sourceSheets.map((value) => {
    const sheet = record(value, 'XML 画布')
    const roots = many(sheet.topic)
    if (roots.length !== 1) throw new Error('XMind XML 画布必须有一个中心主题')
    warnings.omitted(sheet, new Set(['id', 'title', 'topic', 'timestamp', 'modified-by']))
    return { id: sheet.id, title: xmlText(sheet.title), rootTopic: convertTopic(roots[0], 0) }
  })
}
