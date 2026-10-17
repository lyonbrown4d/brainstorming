import type { MindMapDocument, MindMapWorkbook } from '@core'

export interface MarkerVector {
  readonly body: string
  readonly width: number
  readonly height: number
}
let brandIcons: Readonly<Record<string, MarkerVector>> | undefined
let loading: Promise<void> | undefined

/** Load a bundled offline collection only when a brand picker, badge, or export needs it. */
export const loadBrandMarkers = (): Promise<void> => {
  loading ??= import('@iconify-json/simple-icons')
    .then(({ icons }) => {
      brandIcons = Object.fromEntries(
        Object.entries(icons.icons).map(([name, icon]) => [
          `simple-icons:${name}`,
          {
            body: icon.body,
            width: icon.width ?? icons.width ?? 24,
            height: icon.height ?? icons.height ?? 24,
          },
        ]),
      )
    })
    .catch((error: unknown) => {
      loading = undefined
      throw error
    })
  return loading
}
export const brandMarkerIcon = (marker: string): MarkerVector | undefined => {
  return brandIcons && Object.hasOwn(brandIcons, marker) ? brandIcons[marker] : undefined
}
export const brandMarkerNames = (): readonly string[] => {
  return Object.keys(brandIcons ?? {}).filter((name) => name.length <= 64)
}
export const prepareMarkerIcons = async (
  source: MindMapDocument | MindMapWorkbook,
): Promise<void> => {
  const documents = 'sheets' in source ? source.sheets.map((sheet) => sheet.document) : [source]
  if (
    documents.some((document) =>
      Object.values(document.topics).some((topic) =>
        topic.metadata?.markers?.some((marker) => marker.startsWith('simple-icons:')),
      ),
    )
  )
    await loadBrandMarkers()
}
