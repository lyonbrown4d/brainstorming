import { beforeEach, expect, it, vi } from 'vitest'
import { createNativeTransport } from '@renderer/lib/nativeTransport'
const { invoke, minimize } = vi.hoisted(() => ({ invoke: vi.fn(), minimize: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ minimize }) }))
beforeEach(() => {
  invoke.mockReset()
  minimize.mockReset()
})
it('preserves native string rejection messages as Error instances for existing UI feedback', async () => {
  invoke.mockRejectedValue('密码错误或加密文件损坏，请重试')
  await expect(createNativeTransport().request('unlockDocument')).rejects.toThrow('密码错误')
})
it('preserves Error failures and avoids displaying arbitrary rejection objects', async () => {
  const error = new Error('保存失败')
  invoke.mockRejectedValueOnce(error).mockRejectedValueOnce({ secret: 'not user-facing' })
  const transport = createNativeTransport()
  await expect(transport.request('saveDocument')).rejects.toBe(error)
  await expect(transport.request('saveDocument')).rejects.toThrow('本机操作失败')
})
it('normalizes window action failures through the same boundary', async () => {
  minimize.mockRejectedValue('窗口不可用')
  await expect(createNativeTransport().windowAction?.('minimize')).rejects.toThrow('窗口不可用')
})
