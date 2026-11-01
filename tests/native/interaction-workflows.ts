import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '@core'
import type { MindMapDocument } from '@core'
import {
  artifact,
  chooseFile,
  focusNativeWindow,
  home,
  native,
  openSaved,
  readDocument,
  shortcut,
} from '@tests/native/driver'
import { editorReady } from '@tests/native/readiness'
import { startNativePointer } from '@tests/native/native-pointer'

/** Seed through the real native SQLite writer, then exercise the packaged UI and Rust engine. */
export const openWorkflowFixture = async () => {
  await home()
  const document = applyCommand(createDocument('原生工作流', artifact('workflow-document')), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'source', title: '原生来源主题', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'other', title: '原生目标主题', side: 'left' },
      {
        type: 'setTopicStyle',
        topicId: 'source',
        style: { width: 260, scale: 1.25, fontSize: 16, fill: '#d8eddd' },
      },
      { type: 'setTopicMetadata', topicId: 'source', metadata: { labels: ['原生重点'] } },
      { type: 'setTopicStyle', topicId: 'other', style: { fill: '#f5e4d4' } },
    ],
  })
  const name = artifact('interaction-fixture')
  const path = await chooseFile('save', name)
  await native('saveDocument', {
    request: {
      path: null,
      contents: serializeWorkbook(createWorkbook(document)),
      suggestedName: name,
    },
  })
  await native('releaseDocument', { path })
  await openSaved(name)
  await editorReady('原生工作流')
  return { name, document }
}

/** An opened fixture already has a path: save that file and verify the accepted commands. */
export const saveWorkflowFixture = async (
  name: string,
  matches: (document: MindMapDocument) => boolean,
) => {
  await shortcut('s')
  await browser.waitUntil(
    async () => {
      const document = (await readDocument(name)).sheets[0]?.document
      return Boolean(document && matches(document))
    },
    { timeoutMsg: 'The native SQLite file did not reflect the accepted document commands' },
  )
  const document = (await readDocument(name)).sheets[0]?.document
  if (!document) throw new Error('The saved native workbook has no document')
  return document
}

export const renderedBox = (selector: string) =>
  browser.execute((query) => {
    const element = document.querySelector(query)
    if (!element || document.querySelector('[data-canvas-loading]'))
      throw new Error(`A ready native surface is required: ${query}`)
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error(`The native target is hidden: ${query}`)
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }, selector)

/** Wait for viewport motion and overlays before capturing a geometry baseline. */
export const settledNativeControl = async (selector: string) => {
  await focusNativeWindow()
  let previous: Awaited<ReturnType<typeof renderedBox>> | undefined
  let stableSince = Date.now()
  await browser.waitUntil(
    async () => {
      const box = await renderedBox(selector)
      if (
        !previous ||
        Math.abs(box.x - previous.x) > 0.25 ||
        Math.abs(box.y - previous.y) > 0.25 ||
        Math.abs(box.width - previous.width) > 0.25 ||
        Math.abs(box.height - previous.height) > 0.25
      )
        stableSince = Date.now()
      previous = box
      const hit = await browser.execute((query) => {
        const target = document.querySelector(query)
        if (!target) return false
        const rect = target.getBoundingClientRect()
        return (
          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest(query) === target
        )
      }, selector)
      return hit && Date.now() - stableSince > 200
    },
    { timeoutMsg: 'The native drag handle must settle and receive the real pointer hit' },
  )
  return renderedBox(selector)
}

/** Reuse trusted CEF input; an optional held callback checks preview before native pointer-up. */
export const dragNativeControl = async (
  selector: string,
  end: { readonly dx: number; readonly dy?: number } | { readonly selector: string },
  options: { readonly cancel?: boolean; readonly held?: () => Promise<void> } = {},
) => {
  const box = await settledNativeControl(selector)
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const destination = 'selector' in end ? await renderedBox(end.selector) : null
  const finish = destination
    ? { x: destination.x + destination.width / 2, y: destination.y + destination.height / 2 }
    : { x: start.x + ('dx' in end ? end.dx : 0), y: start.y + ('dy' in end ? (end.dy ?? 0) : 0) }
  const pointer = await startNativePointer({ id: selector, start, end: finish })
  try {
    await pointer.held()
    await options.held?.()
    if (options.cancel) await browser.keys(Key.Escape)
  } finally {
    await pointer.release()
  }
}

/** CEF aria lookup does not resolve Radix option names through aria-labelledby. */
export const chooseNativeOption = async (label: string) => {
  await expect(browser.$('[role="listbox"]')).toBeDisplayed()
  for await (const option of browser.$$('[role="option"]')) {
    if ((await option.getText()).trim() === label) {
      await option.click()
      return
    }
  }
  throw new Error(`Missing native option: ${label}`)
}
