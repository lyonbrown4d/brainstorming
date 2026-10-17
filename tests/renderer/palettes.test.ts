import { describe, expect, it } from 'vitest'
import { wcagContrast } from 'culori'
import { applyCommand, createDocument, createWorkbook, validateDocumentSettings } from '@core'
import { mapPalettes, paletteAppearance } from '@shared/palettes'
import { topicAppearance } from '@shared/appearance'
import { encodeBrainstorming, decodeBrainstorming } from '@formats/brainstorming'
import { encodeXmind } from '@formats/interchange/xmind'
import { importXmind } from '@formats/xmind'
import { renderSheetSvg } from '@renderer/export/svg'
import { useEditor } from '@renderer/state/editor'

const document = applyCommand(createDocument('配色'), {
  type: 'addTopic',
  id: 'a',
  parentId: 'root',
  title: '分支',
  side: 'right',
})
describe('独立导图配色', () => {
  it('所有预设的中心、一级与正文文字保持对比度，图形导出使用相同颜色', () => {
    for (const palette of mapPalettes) {
      const styled = applyCommand(document, {
        type: 'setDocumentSettings',
        settings: { theme: palette.id },
      })
      const resolved = paletteAppearance(palette)
      expect(wcagContrast(resolved.text, palette.background)).toBeGreaterThanOrEqual(4.5)
      for (const id of ['root', 'a']) {
        const appearance = topicAppearance(styled, id)
        expect(wcagContrast(appearance.fill, appearance.color)).toBeGreaterThanOrEqual(4.5)
        const exported = renderSheetSvg(styled).svg
        expect(exported).toContain(appearance.fill)
        expect(exported).toContain(appearance.color)
      }
    }
  })
  it('配色按Sheet保存、一次撤销；原生与XMind扩展往返保留自定义颜色', async () => {
    useEditor.getState().replace(document)
    const firstId = useEditor.getState().activeSheetId
    useEditor.getState().addSheet()
    const secondId = useEditor.getState().activeSheetId
    const original = useEditor.getState().history.document
    const palette = mapPalettes[7]
    const portable = {
      name: '工作配色',
      root: palette.root,
      background: palette.background,
      branches: palette.branches,
    }
    expect(
      useEditor
        .getState()
        .command({ type: 'setDocumentSettings', settings: { customPalette: portable } }),
    ).toBe(true)
    const styled = useEditor.getState().history.document
    expect(styled.settings?.customPalette).toEqual(portable)
    useEditor.getState().switchSheet(firstId)
    expect(useEditor.getState().history.document).toEqual(document)
    useEditor.getState().switchSheet(secondId)
    useEditor.getState().undo()
    expect(useEditor.getState().history.document).toEqual(original)
    const workbook = createWorkbook(styled)
    expect(
      (await decodeBrainstorming(await encodeBrainstorming(workbook))).sheets[0]?.document.settings,
    ).toEqual(styled.settings)
    expect(importXmind(encodeXmind(workbook)).workbook.sheets[0]?.document.settings).toEqual(
      styled.settings,
    )
  })
  it('拒绝损坏、自定义字段和超限配色；节点的显式颜色仍优先', () => {
    for (const customPalette of [
      { root: '#ffffff' },
      { name: 'x', root: 'red', background: '#ffffff', branches: Array(5).fill('#ffffff') },
      { name: 'x', root: '#ffffff', background: '#ffffff', branches: Array(6).fill('#ffffff') },
      { ...mapPalettes[0] },
    ])
      expect(() => {
        validateDocumentSettings({ customPalette })
      }).toThrow()
    const styled = applyCommand(
      applyCommand(document, { type: 'setDocumentSettings', settings: { theme: 'night' } }),
      { type: 'setTopicStyle', topicId: 'a', style: { fill: '#ffffff', color: '#112233' } },
    )
    expect(topicAppearance(styled, 'a')).toMatchObject({ fill: '#ffffff', color: '#112233' })
  })
})
