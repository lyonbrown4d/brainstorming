import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { contentTemplateSchema, templateCatalogSchema, templateIdSchema } from '@shared/templates'
import { queryClient } from '@renderer/lib/queryClient'
import { fetchTemplate, templateCatalogOptions } from '@renderer/hooks/useTemplates'
import { desktop } from '@tests/fixtures/desktop'
import { fixtureCatalog, fixtureTemplate } from '@tests/fixtures/templates'

beforeEach(() => {
  queryClient.clear()
})
afterEach(() => {
  queryClient.clear()
})

describe('backend template reads', () => {
  it('deduplicates catalog and template requests while instantiation stays independent', async () => {
    const listTemplates = vi.fn().mockResolvedValue(fixtureCatalog)
    const getTemplate = vi.fn().mockResolvedValue(fixtureTemplate('brainstorm'))
    desktop({ listTemplates, getTemplate })
    const client = new QueryClient()
    const [first, second] = await Promise.all([
      client.query(templateCatalogOptions()),
      client.query(templateCatalogOptions()),
    ])
    expect(first).toEqual(fixtureCatalog)
    expect(second).toBe(first)
    expect(listTemplates).toHaveBeenCalledTimes(1)
    await Promise.all([fetchTemplate('brainstorm'), fetchTemplate('brainstorm')])
    expect(getTemplate).toHaveBeenCalledTimes(1)
    client.clear()
  })

  it('surfaces unavailable catalog reads and allows an explicit retry', async () => {
    const listTemplates = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(fixtureCatalog)
    desktop({ listTemplates })
    const client = new QueryClient()
    await expect(client.query(templateCatalogOptions())).rejects.toThrow('Unavailable')
    expect(listTemplates).toHaveBeenCalledTimes(1)
    await expect(client.query(templateCatalogOptions())).resolves.toEqual(fixtureCatalog)
    expect(listTemplates).toHaveBeenCalledTimes(2)
    client.clear()
  })

  it('accepts future backend catalog identifiers without a frontend ID list', async () => {
    const id = 'future-workflow-2027'
    const catalog = templateCatalogSchema.parse({
      version: 1,
      templates: [{ ...fixtureCatalog.templates[0], id }],
    })
    const content = { ...fixtureTemplate('brainstorm'), id }
    const getTemplate = vi.fn().mockResolvedValue(content)
    desktop({ listTemplates: () => Promise.resolve(catalog), getTemplate })
    const client = new QueryClient()
    const result = await client.query(templateCatalogOptions())
    expect(result.templates[0]?.id).toBe(id)
    await expect(fetchTemplate(id)).resolves.toEqual(content)
    expect(getTemplate).toHaveBeenCalledWith(id)
    expect(templateIdSchema.safeParse('a'.repeat(80)).success).toBe(true)
    expect(() => fixtureTemplate(id)).toThrow('Unknown fixture template')
    client.clear()
  })

  it.each(['../secrets', '/root', 'name.json', 'UPPER', 'blank', '', 'a'.repeat(81)])(
    'rejects invalid or reserved template ID %s before requesting content',
    async (id) => {
      const getTemplate = vi.fn().mockResolvedValue(fixtureTemplate('brainstorm'))
      desktop({ getTemplate })
      await expect(fetchTemplate(id)).rejects.toThrow()
      expect(getTemplate).not.toHaveBeenCalled()
    },
  )

  it('rejects mismatched template files and malformed or oversized resource trees', async () => {
    desktop({ getTemplate: () => Promise.resolve(fixtureTemplate('project')) })
    await expect(fetchTemplate('brainstorm')).rejects.toThrow('identifier mismatch')
    expect(
      templateCatalogSchema.safeParse({
        ...fixtureCatalog,
        templates: [fixtureCatalog.templates[0], fixtureCatalog.templates[0]],
      }).success,
    ).toBe(false)
    expect(
      contentTemplateSchema.safeParse({ ...fixtureTemplate('brainstorm'), id: '../secrets' })
        .success,
    ).toBe(false)
    expect(
      contentTemplateSchema.safeParse({
        ...fixtureTemplate('brainstorm'),
        topics: [{ title: ['', ''], children: [] }],
      }).success,
    ).toBe(false)
    let node = { title: ['深层', 'Deep'] as [string, string], children: [] as unknown[] }
    for (let depth = 0; depth < 11; depth += 1) node = { title: ['深层', 'Deep'], children: [node] }
    expect(
      contentTemplateSchema.safeParse({ ...fixtureTemplate('brainstorm'), topics: [node] }).success,
    ).toBe(false)
  })
})
