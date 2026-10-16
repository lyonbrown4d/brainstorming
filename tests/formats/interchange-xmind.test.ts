import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { applyCommand, createDocument, createWorkbook } from '../../src/core'
import { createAsset } from '../../src/assets'
import { encodeXmind } from '../../src/formats/interchange/xmind'
import { exportSheets } from '../../src/formats/interchange/outline'
import { importXmind } from '../../src/formats/xmind'

const provider = 'org.trelyx.interchange'
describe('XMind Trelyx extension interchange', () => {
  it('rejects archives beyond the reader entry limit before exporting an unreopenable file', () => {
    const base = createDocument('资源数量')
    const ids = Array.from({ length: 510 }, (_, index) => `asset-${index}`)
    const children = Array.from({ length: 16 }, (_, index) => `topic-${index}`)
    const document = {
      ...base,
      assets: Object.fromEntries(
        ids.map((id) => [
          id,
          { id, name: `${id}.bin`, mimeType: 'application/octet-stream', data: '' },
        ]),
      ),
      topics: {
        root: { id: 'root', title: base.title, children, collapsed: false, side: 'right' as const },
        ...Object.fromEntries(
          children.map((id, index) => [
            id,
            {
              id,
              title: id,
              children: [],
              collapsed: false,
              side: 'right' as const,
              attachments: ids.slice(index * 32, (index + 1) * 32),
            },
          ]),
        ),
      },
    }
    expect(() => encodeXmind(createWorkbook(document))).toThrow('512')
  })
  it('keeps cross-sheet links for workbook export and removes unavailable targets for current-sheet export', () => {
    const first = createDocument('第一页', 'first')
    const second = createDocument('第二页', 'second')
    const book = createWorkbook(first)
    const linked = applyCommand(first, {
      type: 'setTopicMetadata',
      topicId: 'root',
      metadata: { link: { kind: 'topic', sheetId: 'second', topicId: 'root' } },
    })
    const workbook = {
      ...book,
      sheets: [
        { id: 'first', name: '第一页', document: linked },
        { id: 'second', name: '第二页', document: second },
      ],
    }
    expect(
      importXmind(encodeXmind(workbook)).workbook.sheets[0]?.document.topics.root?.metadata?.link,
    ).toEqual({ kind: 'topic', sheetId: 'second', topicId: 'root' })
    const current = importXmind(encodeXmind(exportSheets(workbook, 'first'))).workbook
    expect(current.sheets).toHaveLength(1)
    expect(current.sheets[0]?.document.topics.root?.metadata?.link).toBeUndefined()
    expect(linked.topics.root?.metadata?.link).toBeDefined()
  })
  it('preserves embedded audio bytes, MIME and the topic audio reference', () => {
    const audio = {
      ...createAsset(
        new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
        '录音.wav',
        'audio',
      ),
      mimeType: 'audio/wav',
    }
    const document = applyCommand(createDocument(), {
      type: 'setTopicAudio',
      topicId: 'root',
      asset: audio,
    })
    const result = importXmind(encodeXmind(createWorkbook(document))).workbook.sheets[0]?.document
    const id = result?.topics.root?.metadata?.audioAssetId
    expect(id).toBeDefined()
    expect(id ? result.assets?.[id] : undefined).toMatchObject({
      name: audio.name,
      mimeType: audio.mimeType,
      data: audio.data,
    })
  })
  it('round trips annotations, settings, presentation, all attachments, metadata and Markdown notes', () => {
    let document = createDocument('中文中心', 'map')
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'left',
      title: '左分支',
      side: 'left',
    })
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'right',
      title: '右分支',
      side: 'right',
    })
    document = applyCommand(document, {
      type: 'setTopicNotes',
      topicId: 'left',
      notes: '# Markdown\n**正文**',
    })
    document = applyCommand(document, {
      type: 'setTopicMetadata',
      topicId: 'left',
      metadata: {
        labels: ['标签'],
        markers: ['priority-1'],
        notesFormat: 'markdown',
        richTitle: '**左分支**',
        equation: 'x^2',
        task: {
          done: false,
          priority: 2,
          progress: 25,
          due: '2026-12-01',
          dependencies: ['right'],
        },
        link: { kind: 'topic', topicId: 'right' },
      },
    })
    document = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'left',
      style: { lineStyle: 'straight', lineWidth: 5 },
    })
    document = applyCommand(document, {
      type: 'setTopicStructure',
      topicId: 'left',
      structure: 'org-down',
    })
    const assets = [
      createAsset(new Uint8Array([0, 255, 1]), '资料#1%.bin', 'file1'),
      createAsset(new Uint8Array([4, 3, 2]), '二号.bin', 'file2'),
    ]
    for (const asset of assets)
      document = applyCommand(document, { type: 'addTopicAttachment', topicId: 'left', asset })
    document = applyCommand(document, {
      type: 'setDocumentSettings',
      settings: {
        layout: 'logic-left',
        theme: 'forest',
        background: '#112233',
        fontFamily: 'system-ui',
        lineWidth: 4,
      },
    })
    document = applyCommand(document, {
      type: 'upsertRelation',
      relation: {
        id: 'relation',
        from: 'left',
        to: 'right',
        title: '关联',
        arrow: 'both',
        dashed: true,
      },
    })
    document = applyCommand(document, {
      type: 'upsertGroup',
      group: { id: 'group', topicIds: ['left', 'right'], title: '概要', kind: 'summary' },
    })
    document = applyCommand(document, {
      type: 'upsertCallout',
      callout: { id: 'callout', topicId: 'left', text: '标注' },
    })
    document = applyCommand(document, {
      type: 'addFloatingTopic',
      id: 'floating',
      title: '游离',
      x: 300,
      y: 400,
    })
    document = applyCommand(document, {
      type: 'setPresentation',
      steps: [{ topicId: 'left' }, { topicId: 'right' }],
    })
    const book = { ...createWorkbook(document), title: '自定义工作簿标题' }
    const imported = importXmind(encodeXmind(book))
    const result = imported.workbook.sheets[0]?.document
    expect(result).toBeDefined()
    expect(imported.workbook.id).toBe(book.id)
    expect(imported.workbook.title).toBe(book.title)
    expect(result?.topics.left).toMatchObject({
      side: 'left',
      metadata: document.topics.left?.metadata,
      structure: 'org-down',
      notes: '# Markdown\n**正文**',
      style: { lineStyle: 'straight', lineWidth: 5 },
    })
    expect(result?.topics.right?.side).toBe('right')
    for (const key of [
      'settings',
      'relations',
      'groups',
      'callouts',
      'floatingIds',
      'floatingPositions',
      'presentation',
    ] as const)
      expect(result?.[key]).toEqual(document[key])
    expect(result?.topics.left?.attachments).toHaveLength(2)
    expect(Object.values(result?.assets ?? {}).map(({ name, data }) => ({ name, data }))).toEqual(
      assets.map(({ name, data }) => ({ name, data })),
    )
    expect(imported.warnings.filter((warning) => warning.includes('扩展'))).toEqual([])
  })
  it('reports unknown third-party extensions and rejects malformed trusted-format metadata', () => {
    const archive = (extension: unknown) =>
      zipSync({
        'content.json': strToU8(
          JSON.stringify([
            {
              id: 'sheet',
              title: '测试',
              rootTopic: { id: 'root', title: '中心', extensions: [extension] },
            },
          ]),
        ),
      })
    expect(
      importXmind(archive({ provider: 'third.party', content: { scripts: '<script>' } })).warnings,
    ).toContain('未导入 XMind 第三方扩展内容（1 项）')
    expect(() =>
      importXmind(
        archive({
          provider,
          content: { metadata: { link: { kind: 'url', url: 'javascript:alert(1)' } } },
        }),
      ),
    ).toThrow('链接仅支持')
    expect(() =>
      importXmind(
        archive({ provider, content: { attachments: [{ src: 'xap:resources/missing.bin' }] } }),
      ),
    ).toThrow('附件缺失')
    expect(() =>
      importXmind(archive({ provider, content: { metadata: { notesFormat: 'html' } } })),
    ).toThrow()
  })
})
