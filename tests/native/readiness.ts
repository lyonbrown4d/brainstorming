import { browser } from '@wdio/globals'
import type { SpatialTestCanvas } from '@tests/native/independent-spatial'

/** Store commands render before HashRouter reflects them; wait for both contracts. */
export const creationReady = async (
  stage: 'structure' | 'configuration',
  mode: 'document' | 'sheet' = 'document',
): Promise<void> => {
  await browser.waitUntil(
    async () =>
      browser.execute(
        ({ stage, mode }) => {
          const path = window.location.hash.slice(1)
          const expected = `/create/${mode}/${stage}`
          if (
            path !== expected &&
            !(stage === 'structure' && mode === 'document' && path === '/home')
          )
            return false
          const label = mode === 'document' ? '新建文档' : '新建画布'
          const gallery = document.querySelector(`section[aria-label="${label}"]`)
          if (!gallery || gallery.getAttribute('aria-busy') === 'true') return false
          const action = [...gallery.querySelectorAll('button')].find(
            (button) =>
              button.textContent.trim() ===
              (stage === 'structure' ? '下一步' : mode === 'document' ? '创建文档' : '创建画布'),
          )
          const input = gallery.querySelector('input[name="title"]')
          return Boolean(
            action &&
            !action.disabled &&
            action.getClientRects().length &&
            (stage === 'configuration' ? input : !input),
          )
        },
        { stage, mode },
      ),
    { timeoutMsg: `The ${mode} creation form and ${stage} route did not become ready` },
  )
}

export const editorReady = async (title?: string): Promise<void> => {
  await browser.waitUntil(
    async () =>
      browser.execute((expectedTitle) => {
        const topic = document.querySelector('[data-testid="topic-root"]')
        const canvas = document.querySelector<SpatialTestCanvas>(
          'canvas[data-spatial-canvas="three"]',
        )
        const surface = topic ?? canvas
        const title = topic?.textContent ?? canvas?.spatialFrameDiagnostics.rootTitle ?? ''
        const menu = document.querySelector('button[aria-label="文件菜单"]')
        if (!(surface instanceof HTMLElement) || !(menu instanceof HTMLButtonElement)) return false
        if (
          canvas &&
          (!canvas.spatialFrameDiagnostics.renderFrame ||
            !canvas.spatialFrameDiagnostics.topicCount)
        )
          return false
        return (
          window.location.hash.startsWith('#/documents/') &&
          document.visibilityState === 'visible' &&
          !document.querySelector('[data-canvas-loading]') &&
          !document.querySelector(
            'section[aria-label="新建文档"], section[aria-label="新建画布"]',
          ) &&
          !menu.disabled &&
          surface.getClientRects().length > 0 &&
          getComputedStyle(surface).visibility === 'visible' &&
          (expectedTitle === null || title.includes(expectedTitle))
        )
      }, title ?? null),
    { timeoutMsg: 'The active editor route and current canvas did not become ready' },
  )
}

/** Radix menuitems are divs: WebDriver isEnabled() does not inspect their disabled state. */
export const fileMenuItemReady = async (action: string): Promise<void> => {
  await browser.waitUntil(
    async () =>
      browser.execute((label) => {
        const menu = document.querySelector(
          '[role="menu"][data-state="open"][aria-label="文件操作"]',
        )
        const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(
          (element) => element.getAttribute('aria-label') === label,
        )
        return (
          item instanceof HTMLElement &&
          item.getClientRects().length > 0 &&
          item.getAttribute('aria-disabled') !== 'true' &&
          !item.hasAttribute('data-disabled')
        )
      }, action),
    { timeoutMsg: `The current file menu item ${action} did not become available` },
  )
}
