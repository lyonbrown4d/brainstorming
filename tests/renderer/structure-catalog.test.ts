import { describe, expect, it } from 'vitest'
import {
  filterStructureGroups,
  structureGroupFor,
} from '@renderer/components/documents/structureCatalog'
import type { MessageTranslator } from '@renderer/i18n'

const label: MessageTranslator = (key) => key
const values = (group: Parameters<typeof filterStructureGroups>[1], query: string) =>
  filterStructureGroups(label, group, query).flatMap((item) =>
    item.options.map((option) => option.value),
  )

describe('grouped structure catalogue', () => {
  it('groups all supported structures once and shows the selected structure family', () => {
    const all = values('all', '')
    expect(all).toHaveLength(15)
    expect(new Set(all).size).toBe(15)
    expect(values('thought', '')).toEqual(['map', 'logic-right', 'logic-left'])
    expect(structureGroupFor('fishbone')).toBe('analysis')
    expect(structureGroupFor()).toBe('thought')
  })
  it('searches globally with bilingual names and all query terms', () => {
    expect(values('thought', '鱼骨')).toEqual(['fishbone'])
    expect(values('thought', 'FISHBONE')).toEqual(['fishbone'])
    expect(values('time', 'brace right')).toEqual(['brace-right'])
    expect(values('all', '思维导图')).toEqual(['map'])
    expect(values('all', 'matrix')).toEqual(['matrix'])
    expect(values('all', 'unknown diagram')).toEqual([])
    expect(values('thought', '  ')).toEqual(['map', 'logic-right', 'logic-left'])
  })
})
