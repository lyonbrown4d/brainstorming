import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import getPort from 'get-port'
import { $, sleep } from 'zx'
import { z } from 'zod'
import { nativeE2E } from '@project/config/native-e2e'

const versionSchema = z.object({ Browser: z.string().regex(/Chrome\/\d+\.\d+\.\d+\.\d+/) })

export const cefDriverCapability = (version: string): WebdriverIO.Capabilities => ({
  browserName: 'chrome',
  browserVersion: version.split('.').slice(0, 3).join('.'),
  'wdio:enforceWebDriverClassic': true,
  'goog:chromeOptions': { binary: nativeE2E.binary },
  'wdio:chromedriverOptions': {
    allowedIps: ['127.0.0.1'],
    allowedOrigins: ['http://localhost'],
    logPath: join(nativeE2E.artifacts, `chromedriver-${nativeE2E.worker}.log`),
  },
})

export const readCefVersion = async (): Promise<string> => {
  // macOS can validate a newly signed app before its first process starts.
  const result = await $({
    quiet: true,
    timeout: process.platform === 'darwin' ? '30s' : '5s',
  })`${nativeE2E.binary} --e2e-browser-version`
  return z
    .string()
    .regex(/^\d+\.\d+\.\d+\.\d+$/)
    .parse(result.stdout.trim())
}

/** ChromeDriver attaches to the real CEF app; it never launches a separate Chrome UI. */
export const startCefSession = async () => {
  await access(nativeE2E.binary)
  await mkdir(nativeE2E.artifacts, { recursive: true })
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-cef-e2e-'))
  const port = nativeE2E.port ?? (await getPort())
  const child = $({
    quiet: true,
    nothrow: true,
    env: {
      ...process.env,
      BRAINSTORMING_CEF_DEBUG_PORT: String(port),
      BRAINSTORMING_CEF_CACHE: join(directory, 'cef'),
      ...(process.platform === 'linux'
        ? {
            XDG_DATA_HOME: join(directory, 'data'),
            XDG_CONFIG_HOME: join(directory, 'config'),
            XDG_CACHE_HOME: join(directory, 'cache'),
          }
        : {}),
    },
  })`${nativeE2E.binary}`
  const state = { exited: false }
  const result = child.then((output) => {
    state.exited = true
    return output
  })
  const hasExited = (): boolean => state.exited
  const stop = async () => {
    if (!state.exited) {
      await child.kill('SIGTERM')
      await Promise.race([result, sleep(5000)])
      if (!hasExited()) await child.kill('SIGKILL')
    }
    const output = await result
    await writeFile(
      join(nativeE2E.artifacts, `cef-application-${nativeE2E.worker}.log`),
      output.stdout + output.stderr,
    )
    await rm(directory, { recursive: true, force: true })
  }
  try {
    const started = Date.now()
    let version: string | undefined
    while (Date.now() - started < 60_000 && !state.exited) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(1000),
        })
        const { Browser } = versionSchema.parse(await response.json())
        version = Browser.split('/')[1]
        break
      } catch {
        await sleep(200)
      }
    }
    if (!version) throw new Error('CEF E2E app did not expose its local debugging endpoint')
    return {
      processId: z.number().int().positive().parse(child.pid),
      capability: {
        ...cefDriverCapability(version),
        'goog:chromeOptions': { binary: nativeE2E.binary, debuggerAddress: `127.0.0.1:${port}` },
      } satisfies WebdriverIO.Capabilities,
      stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
