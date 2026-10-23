import { describe, expect, it } from 'vitest'
import {
  defaultExportPreferences,
  sanitizeExportPreferences,
} from '@renderer/components/export/documentOptions'

describe('export preferences', () => {
  it('ignores stale and malformed storage values', () => {
    expect(sanitizeExportPreferences({ version: 1, format: 'pdf' })).toEqual(
      defaultExportPreferences,
    )
    expect(
      sanitizeExportPreferences({
        version: 2,
        group: 'documents',
        format: 'javascript',
        scope: 'unknown',
        pdf: { paper: 'oversized', marginMm: 1000 },
        width: '9999999',
      }),
    ).toMatchObject({
      format: 'pdf',
      scope: 'current',
      width: '',
      pdf: { paper: 'auto', marginMm: 12 },
    })
  })

  it('keeps supported PDF and scope settings', () => {
    expect(
      sanitizeExportPreferences({
        ...defaultExportPreferences,
        group: 'documents',
        format: 'pdf',
        scope: 'sheets',
        pdf: { paper: 'a3', orientation: 'landscape', marginMm: 18, paginate: true },
      }),
    ).toMatchObject({
      group: 'documents',
      format: 'pdf',
      scope: 'sheets',
      pdf: { paper: 'a3', orientation: 'landscape', marginMm: 18, paginate: true },
    })
  })
})
