import { expect, it, vi } from 'vitest'
import { fitPreviewPng } from '@renderer/lib/documentPreviewImages'

it('rerenders oversized PNGs at a smaller bounded size until they fit', async () => {
  const smaller = new Uint8Array(512)
  const render = vi
    .fn<(_: string, dimension: number) => Promise<Uint8Array>>()
    .mockResolvedValueOnce(new Uint8Array(1024 * 1024 + 1))
    .mockResolvedValueOnce(smaller)
  expect(await fitPreviewPng('scene', 1024 * 1024, new AbortController().signal, render)).toBe(
    smaller,
  )
  expect(render.mock.calls.map((call) => call[1])).toEqual([1600, 1024])
})

it('bounds retries and allocates a smaller per-sheet budget for large workbooks', async () => {
  const render = vi
    .fn<(_: string, dimension: number) => Promise<Uint8Array>>()
    .mockResolvedValue(new Uint8Array(200_000))
  expect(await fitPreviewPng('scene', 131_072, new AbortController().signal, render)).toBeNull()
  expect(render.mock.calls.map((call) => call[1])).toEqual([1600, 1024, 640, 161])
})

it('cancels between renders instead of encoding the superseded snapshot', async () => {
  const controller = new AbortController()
  const render = vi.fn(() => {
    controller.abort()
    return Promise.resolve(new Uint8Array(1024 * 1024 + 1))
  })
  await expect(fitPreviewPng('scene', 1024 * 1024, controller.signal, render)).rejects.toThrow()
  expect(render).toHaveBeenCalledOnce()
})
