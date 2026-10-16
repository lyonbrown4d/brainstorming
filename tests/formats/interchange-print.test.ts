import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument } from '../../src/core'
import { printSheet } from '../../src/renderer/src/export/print'

function printSurface(fail = false) {
  const printEvents = new Map<string, () => void>()
  const image = {
    alt: '',
    src: '',
    decode: () => (fail ? Promise.reject(new Error('decode failed')) : Promise.resolve()),
  }
  const target = {
    title: '',
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
    fonts: { ready: Promise.resolve() },
    createElement: (tag: string) => (tag === 'img' ? image : { textContent: '' }),
  }
  const frame = {
    title: '',
    tabIndex: 0,
    referrerPolicy: '',
    style: { cssText: '' },
    setAttribute: vi.fn(),
    remove: vi.fn(),
    contentDocument: target,
    contentWindow: {
      addEventListener: (name: string, handler: () => void) => {
        printEvents.set(name, handler)
      },
      focus: vi.fn(),
      print: vi.fn(),
    },
  }
  vi.stubGlobal('window', {
    document: { createElement: () => frame, body: { appendChild: vi.fn() } },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  return { frame, printEvents }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe('complete-map native print adapter', () => {
  it('prints generated complete SVG and releases the isolated document and blob after printing', async () => {
    vi.useFakeTimers()
    const { frame, printEvents } = printSurface()
    const create = vi.spyOn(URL, 'createObjectURL')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    let document = createDocument('打印中文')
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'root',
      id: 'branch',
      title: '折叠分支',
    })
    document = applyCommand(document, {
      type: 'addTopic',
      parentId: 'branch',
      id: 'hidden',
      title: '视口外隐藏主题',
    })
    document = applyCommand(document, { type: 'toggleCollapse', topicId: 'branch' })
    await printSheet(document, true)
    const blob = create.mock.calls[0]?.[0]
    if (!(blob instanceof Blob)) throw new Error('Print SVG was not prepared')
    expect(await blob.text()).toContain('视口外隐藏主题')
    expect(frame.setAttribute).toHaveBeenCalledWith('sandbox', 'allow-same-origin allow-modals')
    expect(frame.contentWindow.print).toHaveBeenCalledTimes(1)
    expect(frame.remove).not.toHaveBeenCalled()
    printEvents.get('afterprint')?.()
    expect(frame.remove).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledTimes(1)
    await vi.runOnlyPendingTimersAsync()
    expect(frame.remove).toHaveBeenCalledTimes(1)
  })
  it('cleans up a failed image decode and reports an actionable print failure', async () => {
    const { frame } = printSurface(true)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    await expect(printSheet(createDocument())).rejects.toThrow('PDF 导出后打印')
    expect(frame.remove).toHaveBeenCalledTimes(1)
    expect(frame.contentWindow.print).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})
