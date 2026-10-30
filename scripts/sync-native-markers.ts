import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { icons } from '@iconify-json/simple-icons'
import { markerOptions } from '@renderer/components/metadata/markers'

const directory = new URL('../crates/brainstorming-geometry/assets/', import.meta.url)
await mkdir(directory, { recursive: true })
const markers = Object.fromEntries(
  markerOptions.map(({ value, Icon }) => [
    value,
    renderToStaticMarkup(
      createElement(Icon, { color: '__MARKER_COLOR__', size: '__MARKER_SIZE__' }),
    ),
  ]),
)
await Promise.all([
  writeFile(new URL('lucide.json', directory), `${JSON.stringify(markers)}\n`),
  writeFile(new URL('simple-icons.json', directory), `${JSON.stringify(icons)}\n`),
  copyFile('node_modules/lucide-react/LICENSE', new URL('LUCIDE-LICENSE', directory)),
])
