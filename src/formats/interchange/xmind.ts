import { zipSync, strToU8, type Zippable } from 'fflate'
import { assetBytes, safeAssetName } from '../../assets'
import type { MindMapWorkbook, Topic, TopicStyle } from '../../core'
import { referencedAssetIds } from '../../core/topic-content'
import { documentExtensionData } from '../../core/extension-data'
import { validateBoundedWorkbook } from '../trelyx/validation'
import { ARCHIVE_LIMITS } from '../archive'

function jsonEntry(value: unknown): Uint8Array {
  const bytes = strToU8(JSON.stringify(value))
  if (bytes.length > ARCHIVE_LIMITS.entry) throw new Error('XMind JSON 条目超过 10 MiB 限制')
  return bytes
}

function properties(style: TopicStyle = {}): Record<string, string | number> {
  const shapes = { rounded: 'roundedRect', rectangle: 'rect', ellipse: 'ellipse' }
  return {
    ...(style.fill ? { 'svg:fill': style.fill } : {}),
    ...(style.color ? { 'fo:color': style.color } : {}),
    ...(style.fontSize ? { 'fo:font-size': `${style.fontSize}pt` } : {}),
    ...(style.bold === undefined ? {} : { 'fo:font-weight': style.bold ? 'bold' : 'normal' }),
    ...(style.italic === undefined ? {} : { 'fo:font-style': style.italic ? 'italic' : 'normal' }),
    ...(style.shape ? { 'shape-class': `org.xmind.topicShape.${shapes[style.shape]}` } : {}),
  }
}
/** Modern XMind ZIP; Trelyx-only metadata is isolated in a namespaced extension. */
export function encodeXmind(workbook: MindMapWorkbook): Uint8Array {
  validateBoundedWorkbook(workbook)
  const archive: Zippable = {}
  const manifest: Record<string, Record<string, never>> = {}
  const sheets = workbook.sheets.map((sheet, sheetIndex) => {
    const paths = new Map<string, string>()
    const referenced = referencedAssetIds(sheet.document.topics)
    for (const topic of Object.values(sheet.document.topics))
      if (topic.metadata?.audioAssetId) referenced.add(topic.metadata.audioAssetId)
    for (const id of referenced) {
      const asset = sheet.document.assets?.[id]
      if (!asset) throw new Error('XMind 导出缺少资源')
      const path = `resources/${sheetIndex}-${paths.size}-${safeAssetName(asset.name).replace(/[%#]/g, '_')}`
      paths.set(id, path)
      archive[path] = assetBytes(asset)
      manifest[path] = {}
    }
    const visit = (id: string): Record<string, unknown> => {
      const topic: Topic | undefined = sheet.document.topics[id]
      if (!topic) throw new Error('XMind 导出缺少主题')
      const attachments = (topic.attachments ?? []).map((assetId) => {
        const asset = sheet.document.assets?.[assetId]
        return {
          src: `xap:${paths.get(assetId) ?? ''}`,
          name: asset?.name,
          mimeType: asset?.mimeType,
        }
      })
      const imageAsset = topic.image ? sheet.document.assets?.[topic.image.assetId] : undefined
      const audioAsset = topic.metadata?.audioAssetId
        ? sheet.document.assets?.[topic.metadata.audioAssetId]
        : undefined
      return {
        id: topic.id,
        class: 'topic',
        title: topic.title,
        branch: topic.collapsed ? 'folded' : 'expanded',
        children: { attached: topic.children.map(visit) },
        ...(topic.style
          ? { style: { id: `style-${topic.id}`, properties: properties(topic.style) } }
          : {}),
        ...(topic.notes ? { notes: { plain: { content: topic.notes } } } : {}),
        ...(topic.image
          ? {
              image: {
                src: `xap:${paths.get(topic.image.assetId) ?? ''}`,
                width: topic.image.width,
                height: topic.image.height,
              },
            }
          : {}),
        ...(attachments[0]
          ? { href: attachments[0].src }
          : topic.metadata?.link?.kind === 'url'
            ? { href: topic.metadata.link.url }
            : {}),
        ...(topic.metadata?.labels ? { labels: topic.metadata.labels } : {}),
        extensions: [
          {
            provider: 'org.trelyx.interchange',
            content: {
              side: topic.side,
              ...(topic.metadata ? { metadata: topic.metadata } : {}),
              ...(topic.structure ? { structure: topic.structure } : {}),
              ...(topic.image && imageAsset
                ? {
                    image: {
                      src: `xap:${paths.get(topic.image.assetId) ?? ''}`,
                      width: topic.image.width,
                      height: topic.image.height,
                      name: imageAsset.name,
                      mimeType: imageAsset.mimeType,
                    },
                  }
                : {}),
              ...(audioAsset
                ? {
                    audio: {
                      src: `xap:${paths.get(audioAsset.id) ?? ''}`,
                      name: audioAsset.name,
                      mimeType: audioAsset.mimeType,
                    },
                  }
                : {}),
              ...(topic.style ? { style: topic.style } : {}),
              attachments,
            },
          },
        ],
      }
    }
    return {
      id: sheet.id,
      class: 'sheet',
      title: sheet.name,
      rootTopic: visit(sheet.document.rootId),
      extensions: [
        {
          provider: 'org.trelyx.interchange',
          content: {
            ...documentExtensionData(sheet.document),
            workbook: { id: workbook.id, title: workbook.title },
          },
        },
      ],
    }
  })
  archive['content.json'] = jsonEntry(sheets)
  archive['metadata.json'] = jsonEntry({
    creator: { name: 'Trelyx', version: '0.1.0' },
    activeSheetId: workbook.sheets[0]?.id,
  })
  archive['manifest.json'] = jsonEntry({
    'file-entries': { 'content.json': {}, 'metadata.json': {}, ...manifest },
  })
  if (Object.keys(archive).length > ARCHIVE_LIMITS.entries)
    throw new Error('XMind 文件条目超过 512 项限制')
  const bytes = zipSync(archive, { level: 6 })
  if (bytes.length > ARCHIVE_LIMITS.compressed) throw new Error('XMind 文件超过 32 MiB 限制')
  return bytes
}
