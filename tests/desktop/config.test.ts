import { describe, expect, it } from 'vitest'
import { validateRendererURL } from '../../electron/config'

describe('开发渲染地址', () => {
  it('只允许明确的本机 HTTP 地址', () => {
    expect(validateRendererURL(undefined)).toBeUndefined()
    expect(validateRendererURL('http://localhost:5173')).toBe('http://localhost:5173/')
    expect(validateRendererURL('https://127.0.0.1:5173')).toBe('https://127.0.0.1:5173/')
    for (const url of [
      'https://example.com',
      'file:///tmp/view.html',
      'javascript:alert(1)',
      'http://localhost.example.com',
      'http://user:secret@localhost:5173',
    ]) {
      expect(() => validateRendererURL(url)).toThrow()
    }
  })
})
