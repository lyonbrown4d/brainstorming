import { verifyNativeSpatialDrop } from '@tests/native/spatial-drop'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '@core'
import { nativeArtifact } from '@tests/native/artifacts'
import { finishNativeCanvasDrag, previewNativeCanvasDrag } from '@tests/native/canvas-drag'
import {
  artifact,
  chooseFile,
  focusNativeWindow,
  home,
  named,
  native,
  openSaved,
  readDocument,
  shortcut,
} from '@tests/native/driver'

const geometry = async (movingId: string, targetId: string, spatial: boolean) =>
  browser.execute(
    ({ movingId, targetId, spatial }) => {
      const bounds = (id: string) => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        if (!node) throw new Error('Missing native projected topic')
        return node.getBoundingClientRect()
      }
      const moving = bounds(movingId),
        target = bounds(targetId),
        root = bounds('root')
      const dx = target.x + target.width / 2 - root.x - root.width / 2
      const dy = target.y + target.height / 2 - root.y - root.height / 2
      const horizontal = spatial && Math.abs(dx) >= Math.abs(dy)
      const direction = spatial ? Math.sign(horizontal ? dx : dy) : -1
      return {
        start: { x: moving.x + moving.width / 2, y: moving.y + 5 },
        end: {
          x:
            target.x +
            target.width / 2 +
            (horizontal ? direction * (target.width / 2 + moving.width / 2 + 22) : 0),
          y:
            target.y +
            target.height / 2 -
            moving.height / 2 +
            5 +
            (horizontal ? 0 : direction * (target.height / 2 + moving.height / 2 + 22)),
        },
      }
    },
    { movingId, targetId, spatial },
  )

it('previews native 2D / 3D attachment before contact and saves one undoable hierarchy command', async () => {
  await home()
  const document = applyCommand(createDocument('提前归属验收'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'branch-a', title: '产品方向', side: 'right' },
      { type: 'addTopic', parentId: 'branch-a', id: 'detail', title: '用户访谈' },
      { type: 'addTopic', parentId: 'root', id: 'branch-b', title: '发布计划', side: 'left' },
    ],
  })
  const name = artifact('drop-prediction')
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
  const currentParent = async () => {
    const saved = (await readDocument(name)).sheets[0]?.document
    return Object.values(saved?.topics ?? {}).find((topic) => topic.children.includes('detail'))?.id
  }
  for (const mode of ['2d', '3d'] as const) {
    const spatial = mode === '3d'
    const targetId = spatial ? 'branch-b' : 'root'
    if (spatial) {
      await named('三维视图').click()
      await verifyNativeSpatialDrop({
        fixture: name,
        movingId: 'detail',
        targetId,
        originalParent: 'branch-a',
        currentParent,
      })
      continue
    }
    await expect(browser.$(`[data-view-mode="${mode}"]`)).toBeDisplayed()
    await expect(browser.$('[data-canvas-loading]')).not.toExist()
    await focusNativeWindow()
    let previous = ''
    await browser.waitUntil(
      async () => {
        const current = JSON.stringify(await geometry('detail', targetId, spatial))
        const settled = current === previous
        previous = current
        return settled
      },
      { timeoutMsg: 'The projected camera and fit viewport must settle before dragging' },
    )
    const { start, end } = await geometry('detail', targetId, spatial)
    const preview = () => browser.$('[data-testid="drop-preview"]')
    const line = () => browser.$('[data-testid="drop-preview-connection-detail"]')
    try {
      expect((await previewNativeCanvasDrag(start, end, 'detail')).changed).toBe(true)
      await expect(preview()).toHaveAttribute('data-drop-predicted', 'true')
      await expect(preview()).toHaveAttribute('data-parent-id', targetId)
      await expect(line()).toHaveAttribute('data-parent-id', targetId)
      expect(await currentParent()).toBe('branch-a')
      await browser.saveScreenshot(
        await nativeArtifact(`brainstorming-native-${mode}-drop-preview.png`),
      )
      await browser.keys(Key.Escape)
    } finally {
      await finishNativeCanvasDrag(end)
    }
    await expect(preview()).not.toExist()
    expect(await currentParent()).toBe('branch-a')
    await focusNativeWindow()
    try {
      await previewNativeCanvasDrag(start, end, 'detail')
      await expect(preview()).toHaveAttribute('data-parent-id', targetId)
    } finally {
      await finishNativeCanvasDrag(end)
    }
    await browser.waitUntil(async () => (await currentParent()) === targetId)
    await expect(line()).not.toExist()
    await shortcut('z')
    await browser.waitUntil(async () => (await currentParent()) === 'branch-a')
  }
}).timeout(300_000)
