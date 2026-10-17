import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { WindowLifecycle, type WindowPorts } from '@main/application/window'
import { WindowSession } from '@main/application/session'
import type { StartupWindow } from '@main/startupWindow'
import { LanguageStore } from '@main/language'
import type { AppLanguage } from '@shared/language'

vi.mock('electron', () => ({ nativeTheme: new EventEmitter() }))

const fixture = async (locale: AppLanguage) => {
  const language = new LanguageStore(
    {
      getLanguage: () => Promise.resolve(locale),
      setLanguage: () => Promise.resolve(),
    },
    'en',
  )
  await language.initialize()
  const session = new WindowSession()
  const window = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }),
    close: vi.fn(),
    loadFile: () => Promise.resolve(),
    isDestroyed: () => false,
  })
  const clearRecovery = vi.fn<() => Promise<void>>().mockResolvedValue()
  const showMessageBox = vi.fn<WindowPorts['showMessageBox']>().mockResolvedValue({
    response: 0,
    checkboxChecked: false,
  })
  const ports: WindowPorts = {
    createWindow: () => window as unknown as BrowserWindow,
    createStartup: () => ({ attach: vi.fn(), dispose: vi.fn() }) as unknown as StartupWindow,
    installChrome: vi.fn(),
    showMessageBox,
    showErrorBox: vi.fn(),
    quit: vi.fn(),
  }
  const lifecycle = new WindowLifecycle(
    session,
    { clearRecovery },
    {
      storageDirectory: '/unused',
      rendererURL: undefined,
      platform: 'darwin',
    },
    ports,
    language,
  )
  lifecycle.create()
  const close = () => {
    const preventDefault = vi.fn()
    window.emit('close', { preventDefault })
    return preventDefault
  }
  return { session, window, language, clearRecovery, ports, close }
}

describe('native close language and all-document confirmation', () => {
  it.each([
    ['zh-CN', '关闭 Brainstorming', '有打开的导图尚未保存。', ['返回编辑', '丢弃并关闭']],
    [
      'en',
      'Close Brainstorming',
      'Some open maps have unsaved changes.',
      ['Return to editing', 'Discard and close'],
    ],
  ] as const)(
    'uses %s for the aggregate dirty-document prompt and preserves maps on cancel',
    async (locale, title, message, buttons) => {
      const state = await fixture(locale)
      // Renderer publishes aggregate dirty state, including inactive map tabs.
      state.session.dirty = true
      state.session.quitting = true
      expect(state.close()).toHaveBeenCalledOnce()
      await vi.waitFor(() => {
        expect(state.session.quitting).toBe(false)
      })
      expect(state.ports.showMessageBox).toHaveBeenCalledWith(
        state.window,
        expect.objectContaining({
          title,
          message,
          buttons: [...buttons],
          defaultId: 0,
          cancelId: 0,
        }),
      )
      expect(state.window.close).not.toHaveBeenCalled()
      expect(state.clearRecovery).not.toHaveBeenCalled()
    },
  )

  it('uses the current menu language on each attempt and closes only after explicit discard', async () => {
    const state = await fixture('zh-CN')
    state.session.dirty = true
    await state.language.set('en')
    vi.mocked(state.ports.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false })
    state.close()
    await vi.waitFor(() => {
      expect(state.window.close).toHaveBeenCalledOnce()
    })
    expect(state.ports.showMessageBox).toHaveBeenCalledWith(
      state.window,
      expect.objectContaining({ title: 'Close Brainstorming' }),
    )
    expect(state.clearRecovery).not.toHaveBeenCalled()
  })

  it.each([
    ['zh-CN', '无法关闭', '自动恢复文件清理失败，请重试。所有打开的导图仍保留在窗口中。'],
    [
      'en',
      'Unable to close',
      'Could not clear recovery files. Please try again. All open maps remain in the window.',
    ],
  ] as const)(
    'keeps the window open and reports cleanup failures in %s',
    async (locale, title, detail) => {
      const state = await fixture(locale)
      state.session.dirty = true
      state.session.preserveRecovery = false
      state.session.quitting = true
      state.clearRecovery.mockRejectedValue(new Error('disk unavailable'))
      vi.mocked(state.ports.showMessageBox).mockResolvedValue({
        response: 1,
        checkboxChecked: false,
      })
      state.close()
      await vi.waitFor(() => {
        expect(state.ports.showErrorBox).toHaveBeenCalledWith(title, detail)
      })
      expect(state.window.close).not.toHaveBeenCalled()
      expect(state.session.quitting).toBe(false)
    },
  )

  it('closes clean workspaces without a discard prompt', async () => {
    const state = await fixture('en')
    state.close()
    await vi.waitFor(() => {
      expect(state.window.close).toHaveBeenCalledOnce()
    })
    expect(state.ports.showMessageBox).not.toHaveBeenCalled()
    expect(state.clearRecovery).not.toHaveBeenCalled()
  })
})
