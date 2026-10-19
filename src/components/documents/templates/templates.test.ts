import { afterEach, describe, expect, it } from 'vitest'
import { applyCommand, deserializeDocument, serializeDocument, validateDocument } from '@core'
import { i18n, initializeI18n } from '@renderer/i18n'
import {
  createTemplate as requestTemplate,
  instantiateTemplate,
} from '@renderer/components/documents/templates'
import { fixtureCatalog, fixtureTemplate } from '@tests/fixtures/templates'
import { desktop } from '@tests/fixtures/desktop'
import type { TemplateId } from '@shared/templates'
import type { TemplateTopic } from '@shared/templates'

const templateOptions = fixtureCatalog.templates
const createTemplate = (id: TemplateId, language = i18n.resolvedLanguage ?? i18n.language) =>
  instantiateTemplate(fixtureTemplate(id), language)

const descendants = (nodes: readonly TemplateTopic[]): readonly TemplateTopic[] =>
  nodes.flatMap((node) => [node, ...descendants(node.children)])

afterEach(async () => initializeI18n('zh-CN'))

describe('content templates', () => {
  it.each(['zh-CN', 'en'])('instantiates every preset as a valid editable %s tree', (language) => {
    for (const option of templateOptions) {
      const document = createTemplate(option.id, language)
      expect(() => {
        validateDocument(document)
      }).not.toThrow()
      expect(Object.keys(document.topics)).toHaveLength(option.count)
      expect(option.count).toBeGreaterThan(15)
      expect(document.title).toBe(option.title[language === 'en' ? 1 : 0])
      expect(document.topics[document.rootId]?.title).toBe(document.title)
      expect(Object.values(document.topics).some((node) => node.notes?.length)).toBe(true)
      expect(deserializeDocument(serializeDocument(document))).toEqual(document)
      if (language === 'en') {
        for (const node of Object.values(document.topics))
          expect(`${node.title} ${node.notes ?? ''}`).not.toMatch(/[\u3400-\u9fff]/u)
      }
    }
  })

  it('uses complete localized content and different trees across purposes', () => {
    const signatures = templateOptions.map(({ id }) => {
      const template = fixtureTemplate(id)
      const all = descendants(template.topics)
      for (const node of all) {
        expect(node.title.every((text) => text.trim().length > 0)).toBe(true)
        if (node.notes) expect(node.notes.every((text) => text.trim().length > 0)).toBe(true)
      }
      return all.map((node) => node.title[0]).join('|')
    })
    expect(new Set(signatures).size).toBe(templateOptions.length)
    expect(new Set(templateOptions.map((option) => option.group)).size).toBe(4)
  })

  it('creates independent IDs and nested data across repeated instantiation', () => {
    const original = createTemplate('brainstorm', 'en')
    const second = createTemplate('brainstorm', 'en')
    expect(second.id).not.toBe(original.id)
    const firstIds = new Set(Object.keys(original.topics).filter((id) => id !== original.rootId))
    expect(Object.keys(second.topics).some((id) => firstIds.has(id))).toBe(false)
    expect(second.topics.root?.children).not.toBe(original.topics.root?.children)
    const childId = original.topics.root?.children[0]
    if (!childId) throw new Error('Missing first workflow step')
    const edited = applyCommand(original, {
      type: 'renameTopic',
      topicId: childId,
      title: 'Changed',
    })
    expect(edited.topics[childId]?.title).toBe('Changed')
    expect(Object.values(second.topics).some((node) => node.title === 'Changed')).toBe(false)
    expect(createTemplate('brainstorm', 'en').topics.root?.children).toHaveLength(6)
  })

  it('guides brainstorming from problem definition through validation and review', () => {
    const document = createTemplate('brainstorm', 'zh-CN')
    const steps = document.topics.root?.children.map((id) => document.topics[id]) ?? []
    expect(steps.map((node) => node?.title)).toEqual([
      '1 · 定义问题',
      '2 · 独立发散',
      '3 · 聚类与补充',
      '4 · 评估与选择',
      '5 · 转成行动',
      '6 · 验证与复盘',
    ])
    expect(steps.every((step) => step?.notes && step.children.length >= 2)).toBe(true)
    const titles = Object.values(document.topics).map((node) => node.title)
    expect(titles).toContain('负责人：待认领')
    expect(titles).toContain('实验假设与判断阈值')
    expect(titles).toContain('决定：继续、调整或停止')
    expect(
      Object.values(document.topics).some((node) =>
        node.children.some((child) => (document.topics[child]?.children.length ?? 0) > 0),
      ),
    ).toBe(true)
  })

  it('uses the active interface language at creation and allows independent structure overrides', async () => {
    await initializeI18n('en')
    expect(i18n.resolvedLanguage).toBe('en')
    desktop()
    const document = await requestTemplate('brainstorm')
    expect(document.title).toBe('Guided brainstorming')
    const changed = applyCommand(document, {
      type: 'setDocumentSettings',
      settings: { layout: 'tree-up' },
    })
    expect(changed.settings?.layout).toBe('tree-up')
    expect(changed.topics).toEqual(document.topics)
    await initializeI18n('zh-CN')
    expect(createTemplate('brainstorm').title).toBe('头脑风暴工作流')
    expect(document.title).toBe('Guided brainstorming')
  })
})
