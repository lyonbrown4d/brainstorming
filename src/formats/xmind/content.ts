import { DOMParser, type Node as XmlNode } from '@xmldom/xmldom'
import type { DocumentAsset, Topic, TopicImage } from '../../core'
import { createAsset, imageDimensions } from '../../assets'
import { ASSET_LIMITS } from '../trelyx/assets'
import type { SourceRecord, Warnings } from './common'

function object(value: unknown): SourceRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SourceRecord)
    : undefined
}

function plain(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const source = object(value)
  return typeof source?.content === 'string' ? source.content : undefined
}

/** Read rich notes as text only; no third-party markup reaches the renderer. */
function richText(value: unknown): string {
  const text = plain(value)
  if (text !== undefined) {
    if (!text.includes('<')) return text
    if (text.length > 1024 * 1024) throw new Error('富文本备注超过限制')
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('备注声明不安全')
    const root = new DOMParser().parseFromString(text, 'text/html')
    const visit = (node: XmlNode): string => {
      if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? ''
      if (['script', 'style'].includes(node.nodeName.toLowerCase())) return ''
      if (node.nodeName.toLowerCase() === 'br') return '\n'
      let result = ''
      for (let child = node.firstChild; child; child = child.nextSibling) result += visit(child)
      return result + (/^(?:p|div|li)$/i.test(node.nodeName) ? '\n' : '')
    }
    return visit(root).trimEnd()
  }
  if (Array.isArray(value)) return value.map(richText).join('')
  const source = object(value)
  if (!source) return ''
  return Object.entries(source)
    .map(([key, child]) => {
      if (key === 'br') return '\n'
      if (key === '#text') return typeof child === 'string' ? child : ''
      const block = /^(?:p|div|li)$/i.test(key)
      const text = Array.isArray(child) && block ? child.map(richText).join('\n') : richText(child)
      return text + (block ? '\n' : '')
    })
    .join('')
    .trimEnd()
}

function notes(value: unknown, warnings: Warnings): string | undefined {
  if (value === undefined) return undefined
  const source = object(value)
  const content = plain(source?.plain)
  if (content !== undefined) {
    if (source?.html !== undefined || source?.rich !== undefined || source?.realHTML !== undefined)
      warnings.add('XMind 富文本备注已转为纯文本，格式未保留')
    return content
  }
  const rich = source?.html ?? source?.rich ?? source?.realHTML
  if (rich !== undefined) {
    try {
      const text = richText(rich)
      warnings.add('XMind 富文本备注已转为纯文本，格式未保留')
      return text
    } catch {
      warnings.add('XMind 备注格式无效，已跳过')
      return undefined
    }
  }
  warnings.add('XMind 备注格式无效，已跳过')
  return undefined
}

function embeddedPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  let path: string
  try {
    path = decodeURIComponent(value.replace(/^xap:/i, ''))
  } catch {
    return undefined
  }
  if (!/^(?:resources|attachments)\//i.test(path) || /[\\\0:?#]/.test(path)) return undefined
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) return undefined
  return path
}

export class EmbeddedContent {
  readonly assets: Record<string, DocumentAsset> = {}
  private readonly paths = new Map<string, string>()

  constructor(
    private readonly entries: ReadonlyMap<string, Uint8Array>,
    private readonly used: Set<string>,
    private readonly budget: { bytes: number },
    private readonly warnings: Warnings,
  ) {}

  topic(source: SourceRecord): Pick<Topic, 'notes' | 'image' | 'attachments'> {
    const text = notes(source.notes, this.warnings)
    const result: { notes?: string; image?: TopicImage; attachments?: string[] } = {}
    if (text !== undefined) {
      result.notes = text.slice(0, 100_000)
      if (text.length > 100_000) this.warnings.add('XMind 备注超过 100000 字符，已截断')
    }
    if (source.image !== undefined) {
      const asset = this.resource(object(source.image)?.src, true)
      if (asset) result.image = { assetId: asset.id, ...imageDimensions(asset) }
    }
    if (source.href !== undefined) {
      const asset = this.resource(source.href, false)
      if (asset) result.attachments = [asset.id]
    }
    return result
  }

  private resource(value: unknown, image: boolean): DocumentAsset | undefined {
    const kind = image ? '图片' : '附件或外部链接'
    const path = embeddedPath(value)
    const bytes = path ? this.entries.get(path) : undefined
    if (!path || !bytes) {
      this.warnings.add(`XMind ${kind}不是有效的内嵌资源或资源缺失，已跳过`)
      return undefined
    }
    try {
      const existingId = this.paths.get(path)
      const existing = existingId ? this.assets[existingId] : undefined
      const asset =
        existing ??
        createAsset(bytes, path.split('/').at(-1) ?? '附件', `xmind-asset-${this.paths.size + 1}`)
      if (image) imageDimensions(asset)
      if (!existing) {
        if (
          bytes.length > ASSET_LIMITS.entry ||
          this.budget.bytes + bytes.length > ASSET_LIMITS.total
        )
          throw new Error('资源超过限制')
        this.assets[asset.id] = asset
        this.paths.set(path, asset.id)
        this.budget.bytes += bytes.length
      }
      this.used.add(path)
      return asset
    } catch {
      this.warnings.add(`XMind ${kind}格式不支持、损坏或超过大小限制，已跳过`)
      return undefined
    }
  }
}
