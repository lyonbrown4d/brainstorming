import { z } from 'zod'
import { validateDocumentAsset, type DocumentAsset } from '@core'

export const artGroups = ['ideas', 'plans', 'feelings', 'nature', 'scenes'] as const
export const builtinArtSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  title: z.tuple([z.string().min(1).max(100), z.string().min(1).max(100)]),
  keywords: z.tuple([z.string().max(500), z.string().max(500)]),
  group: z.enum(artGroups),
  source: z.enum(['fluent', 'original']),
  thumbnail: z
    .string()
    .regex(/^data:image\/(?:svg\+xml|png);base64,[A-Za-z0-9+/=]+$/)
    .max(100000),
})
export const builtinArtCatalogSchema = z
  .strictObject({
    version: z.literal(1),
    licenseText: z.string().min(1).max(5000),
    items: z.array(builtinArtSchema).max(100),
  })
  .refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length)
export type BuiltinArt = z.infer<typeof builtinArtSchema>
export type BuiltinArtCatalog = z.infer<typeof builtinArtCatalogSchema>
export interface BuiltinArtAPI {
  listBuiltinArt(): Promise<BuiltinArtCatalog>
  getBuiltinArt(id: string): Promise<DocumentAsset>
}
export const parseBuiltinArtAsset = (value: unknown): DocumentAsset => {
  validateDocumentAsset(value)
  if (value.mimeType !== 'image/png' || value.storage) throw new Error('Invalid built-in artwork')
  return value
}
export const artText = (text: readonly [string, string], language: string): string =>
  text[language.startsWith('en') ? 1 : 0]
export const matchesArt = (item: BuiltinArt, query: string): boolean => {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/u)
  const text = [item.id, ...item.title, ...item.keywords].join(' ').toLocaleLowerCase()
  return terms.every((term) => text.includes(term))
}
