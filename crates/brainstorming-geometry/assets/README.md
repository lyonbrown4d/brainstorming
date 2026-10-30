# Offline marker sources

These SVG registries are derived by `pnpm sync:native-markers` from locked frontend dependencies. No network request or JavaScript engine is used at export time.

- `lucide.json`: `lucide-react` 1.64.0, business marker whitelist from `src/components/metadata/markers.ts`. License: ISC, see `LUCIDE-LICENSE`.
- `simple-icons.json`: `@iconify-json/simple-icons` 1.2.101, upstream Simple Icons 16.36.0. License: CC0-1.0, source: https://github.com/simple-icons/simple-icons, license: https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md. Brand names and logos may have separate trademark restrictions.

The native geometry dependencies Roughr 0.12.0 and perfect_freehand 0.1.1 are MIT-licensed Rust ports. Native desktop and CLI exports share these implementations. Roughr output is deterministic for a given seed; it is not guaranteed to reproduce Rough.js paths byte for byte. Ink regression fixtures are captured from perfect-freehand 1.2.3 with the live renderer options and verify numerical parity.
