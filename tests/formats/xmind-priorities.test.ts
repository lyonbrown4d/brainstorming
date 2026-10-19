import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { TASK_PRIORITIES } from '@core'
import { importXmind } from '@formats/xmind'
import { encodeXmind } from '@formats/interchange/xmind'

const modern = (markers: unknown) =>
  zipSync({
    'content.json': strToU8(
      JSON.stringify([
        {
          id: 'sheet',
          title: '优先级',
          rootTopic: { id: 'root', title: '主题', markers },
        },
      ]),
    ),
  })

describe('XMind standard priority markers', () => {
  it.each(TASK_PRIORITIES)(
    'imports and exports priority %i without depending on a private extension',
    (priority) => {
      const imported = importXmind(modern([{ markerId: `priority-${priority}` }]))
      expect(imported.workbook.sheets[0]?.document.topics.root?.metadata?.task).toEqual({
        priority,
      })
      expect(imported.warnings).toEqual([])
      const archive = unzipSync(encodeXmind(imported.workbook))
      const bytes = archive['content.json']
      if (!bytes) throw new Error('Missing XMind content')
      const sheets = JSON.parse(strFromU8(bytes)) as {
        rootTopic: { markers: unknown; extensions?: unknown }
      }[]
      expect(sheets[0]?.rootTopic.markers).toEqual([{ markerId: `priority-${priority}` }])
      for (const sheet of sheets) delete sheet.rootTopic.extensions
      archive['content.json'] = strToU8(JSON.stringify(sheets))
      const restored = importXmind(zipSync(archive))
      expect(restored.workbook.sheets[0]?.document.topics.root?.metadata?.task).toEqual({
        priority,
      })
    },
  )
  it('imports legacy priority 9 and reports unsupported and duplicate markers', () => {
    const xml =
      '<xmap-content><sheet id="sheet"><title>旧版</title><topic id="root"><title>主题</title><marker-refs><marker-ref marker-id="priority-9"/></marker-refs></topic></sheet></xmap-content>'
    const imported = importXmind(zipSync({ 'content.xml': strToU8(xml) }))
    expect(imported.workbook.sheets[0]?.document.topics.root?.metadata?.task).toEqual({
      priority: 9,
    })
    expect(imported.warnings).toEqual([])
    const mixed = importXmind(
      modern([{ markerId: 'priority-9' }, { markerId: 'priority-1' }, { markerId: 'priority-10' }]),
    )
    expect(mixed.workbook.sheets[0]?.document.topics.root?.metadata?.task).toEqual({ priority: 9 })
    expect(mixed.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('重复的优先级'),
        expect.stringContaining('未导入 XMind 图标'),
      ]),
    )
    expect(() => importXmind(modern('priority-9'))).toThrow('列表')
  })
})
