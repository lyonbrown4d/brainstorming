import { z } from 'zod'
import { LAYOUT_KINDS } from '@core/extensions'

/** The backend owns available IDs; the renderer validates syntax, never enumerates the catalog. */
export const templateIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .refine((id) => id !== 'blank', 'blank is reserved for creation without a template')
export type TemplateId = z.infer<typeof templateIdSchema>
const text = (limit: number) =>
  z
    .string()
    .min(1)
    .max(limit)
    .refine((value) => value.trim().length > 0, 'Text cannot be blank')
export const templateTextSchema = z.tuple([text(500), text(500)])
export type TemplateText = z.infer<typeof templateTextSchema>
export interface TemplateTopic {
  readonly title: TemplateText
  readonly notes?: TemplateText | undefined
  readonly children: readonly TemplateTopic[]
}
const topicSchema: z.ZodType<TemplateTopic> = z.lazy(() =>
  z.strictObject({
    title: templateTextSchema,
    notes: z.tuple([text(10000), text(10000)]).optional(),
    children: z.array(topicSchema).max(100),
  }),
)
export const templateIconSchema = z.enum([
  'lightbulb',
  'wand-sparkles',
  'brain-circuit',
  'clipboard-list',
  'messages-square',
  'rotate-ccw',
  'git-branch',
  'chart-no-axes-combined',
  'search',
  'users',
  'graduation-cap',
  'book-open',
  'pen-line',
  'target',
])
const metadataShape = {
  id: templateIdSchema,
  title: templateTextSchema,
  description: templateTextSchema,
  group: z.enum(['ideate', 'plan', 'analyze', 'learn']),
  icon: templateIconSchema,
  layout: z.enum(LAYOUT_KINDS),
}
export const templateSummarySchema = z.strictObject({
  ...metadataShape,
  count: z.number().int().min(1).max(1000),
})
export const templateCatalogSchema = z
  .strictObject({
    version: z.literal(1),
    templates: z.array(templateSummarySchema).max(100),
  })
  .refine(
    (catalog) =>
      new Set(catalog.templates.map((item) => item.id)).size === catalog.templates.length,
    'Duplicate template identifiers',
  )
export const contentTemplateSchema = z
  .strictObject({
    ...metadataShape,
    version: z.literal(1),
    topics: z.array(topicSchema).max(100),
  })
  .superRefine((template, context) => {
    let count = 1
    const pending = template.topics.map((node) => ({ node, depth: 1 }))
    while (pending.length) {
      const current = pending.pop()
      if (!current) break
      count += 1
      if (count > 1000 || current.depth > 10) {
        context.addIssue({ code: 'custom', message: 'Template tree exceeds limits' })
        break
      }
      pending.push(...current.node.children.map((node) => ({ node, depth: current.depth + 1 })))
    }
  })
export type TemplateSummary = z.infer<typeof templateSummarySchema>
export type TemplateCatalog = z.infer<typeof templateCatalogSchema>
export type ContentTemplate = z.infer<typeof contentTemplateSchema>
export interface TemplatesAPI {
  listTemplates(): Promise<TemplateCatalog>
  getTemplate(id: TemplateId): Promise<ContentTemplate>
}
export const templateText = (text: TemplateText, language: string): string =>
  text[language.startsWith('en') ? 1 : 0]
