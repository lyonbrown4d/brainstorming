import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureCurrentExportView } from '@renderer/export/captureCurrentExportView'

const attributes = new Map<string, string>()
const canvas = {
  getBoundingClientRect: () => ({ x: 100, y: 50, width: 900, height: 700 }),
}
const querySelector = vi.fn((selector: string) =>
  selector === 'canvas[data-spatial-canvas="three"]' ? canvas : null,
)
const page = { title: '视角', svg: '<svg/>', width: 900, height: 700 }

beforeEach(() => {
  attributes.clear()
  querySelector.mockClear()
  vi.stubGlobal('document', {
    querySelector,
    querySelectorAll: () => [],
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    },
  })
  vi.stubGlobal('innerWidth', 1280)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => {
      callback(0)
    })
    return 1
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('independent 3D view export', () => {
  it('captures the Three canvas bounds without requiring a React Flow projection', async () => {
    const captureView = vi.fn(() => Promise.resolve(page))
    await expect(captureCurrentExportView({ captureView })).resolves.toEqual(page)
    expect(captureView).toHaveBeenCalledWith({
      x: 100,
      y: 50,
      width: 900,
      height: 700,
      viewportWidth: 1280,
      viewportHeight: 800,
    })
    expect(attributes.has('data-export-capture')).toBe(false)
  })

  it('restores capture visibility state when the native snapshot fails', async () => {
    attributes.set('data-export-capture', 'previous')
    await expect(
      captureCurrentExportView({ captureView: () => Promise.reject(new Error('截图失败')) }),
    ).rejects.toThrow('截图失败')
    expect(attributes.get('data-export-capture')).toBe('previous')
  })
})
