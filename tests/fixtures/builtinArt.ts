import manifest from '@project/crates/brainstorming-engine/src/builtin_art/catalog.json'
import { base64 } from '@scure/base'
import { builtinArtCatalogSchema, type BuiltinArtAPI } from '@shared/builtinArt'

export const fixtureArtCatalog = builtinArtCatalogSchema.parse({
  version: manifest.version,
  licenseText: manifest.licenseText,
  items: manifest.items.map(({ svg, ...item }) => ({
    ...item,
    thumbnail: svg
      ? `data:image/svg+xml;base64,${base64.encode(new TextEncoder().encode(svg))}`
      : item.thumbnail,
  })),
})
// Real raster fixture; native rendering is separately checked for all 54 curated IDs.
export const fixtureArtAsset = (id: string) => ({
  id: `builtin-art-v1-${id}`,
  name: `${id}.png`,
  mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAATklEQVR4nO3PUQkAIBTAwNfZCmYzlyH8OITBAtxmr/N1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AVy66MQNatJXAAAAAElFTkSuQmCC',
})
export const builtinArtAPI: BuiltinArtAPI = {
  listBuiltinArt: () => Promise.resolve(fixtureArtCatalog),
  getBuiltinArt: (id) =>
    fixtureArtCatalog.items.some((item) => item.id === id)
      ? Promise.resolve(fixtureArtAsset(id))
      : Promise.reject(new Error('Unknown artwork')),
}
