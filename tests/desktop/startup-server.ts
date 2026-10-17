import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

/** Serves the actual production HTML/assets while holding only the editor module. */
export const startupServer = async () => {
  let unblock: (() => void) | undefined
  let requested: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const editorRequested = new Promise<void>((resolve) => {
    requested = resolve
  })
  let failNext = true
  const root = resolve('out/renderer')
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const name = new URL(request.url ?? '/', 'http://localhost').pathname
        const path = resolve(root, `.${name === '/' ? '/index.html' : name}`)
        if (!path.startsWith(root + sep)) throw new Error('不合法的测试资源路径')
        if (/\/main-[^/]+\.js$/.test(path)) {
          requested?.()
          await blocked
          if (failNext) {
            failNext = false
            response.writeHead(503).end()
            return
          }
        }
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
        }
        response.writeHead(200, {
          'Content-Type': types[extname(path)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        response.end(await readFile(path))
      } catch {
        response.writeHead(404).end()
      }
    })()
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    editorRequested,
    release: () => {
      unblock?.()
    },
    close: async () => {
      unblock?.()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}
