import 'dotenv/config'
import { mkdir, readlink, realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { $, sleep } from 'zx'
import { z } from 'zod'

const { values } = parseArgs({
  options: {
    gpu: { type: 'boolean', default: false },
    reference: { type: 'boolean', default: false },
  },
})
if ([values.gpu, values.reference].filter(Boolean).length > 1)
  throw new Error('Choose GPU or SVG reference, not both')

const application = await realpath(
  resolve(process.env.BRAINSTORMING_E2E_BINARY ?? 'src-tauri/target/debug/brainstorming'),
)
const hyprland = process.platform === 'linux' && !!process.env.HYPRLAND_INSTANCE_SIGNATURE
const run = $({ quiet: true, timeout: '3s' })
const clientSchema = z.object({
  address: z.string().regex(/^0x[\da-f]+$/i),
  pid: z.number().int().positive(),
  class: z.string(),
  size: z.tuple([z.number(), z.number()]),
  mapped: z.boolean(),
  hidden: z.boolean(),
})
const activeSchema = z.object({
  address: z.string().optional(),
  pid: z.number().optional(),
  class: z.string().optional(),
})
const trace: (z.infer<typeof activeSchema> & { elapsedMs: number })[] = []
const started = Date.now()
let activated: string | undefined
let activationCount = 0
const activationResults: string[] = []
let previous = ''
const status = { running: true }

const benchmark = $({
  stdio: 'inherit',
  nothrow: true,
  timeout: '150s',
  env: {
    ...process.env,
    ...(process.platform === 'linux' ? { GDK_BACKEND: 'x11' } : {}),
    BRAINSTORMING_BENCHMARK_RUNS: '5',
    BRAINSTORMING_EXPECT_GPU: values.gpu ? '1' : '0',
    BRAINSTORMING_EXPECT_SVG: values.gpu ? '0' : '1',
    BRAINSTORMING_GPU_REFERENCE: values.reference ? '1' : '0',
  },
})`pnpm exec wdio run wdio.conf.ts --spec tests/native/canvas-performance.spec.ts`
const completion = benchmark.finally(() => {
  status.running = false
})

try {
  while (status.running) {
    if (hyprland) {
      if (!activated) {
        const clients = z
          .array(clientSchema)
          .parse(JSON.parse((await run`hyprctl -j clients`).stdout))
        const candidates = clients.filter(
          (client) =>
            client.mapped &&
            !client.hidden &&
            client.size[1] > 400 &&
            /brainstorm/i.test(client.class),
        )
        const executables = await Promise.all(
          candidates.map(async (client) => ({
            client,
            executable: await readlink(`/proc/${client.pid}/exe`).catch(() => null),
          })),
        )
        const target = executables.find((item) => item.executable === application)?.client
        if (target) {
          const selector = `address:${target.address}`
          activationResults.push(
            (
              await run`hyprctl dispatch ${`hl.dsp.focus({ window = "${selector}" })`}`
            ).stdout.trim(),
          )
          activationCount += 1
          const active = activeSchema.parse(JSON.parse((await run`hyprctl -j activewindow`).stdout))
          if (active.address !== target.address)
            throw new Error('Compositor did not activate the E2E window')
          activationResults.push(
            (
              await run`hyprctl dispatch ${`hl.dsp.window.fullscreen({ mode = "maximized", action = "set", window = "${selector}" })`}`
            ).stdout.trim(),
          )
          if (activationResults.some((value) => value !== 'ok'))
            throw new Error('Compositor rejected benchmark activation or sizing')
          activated = target.address
        }
      }
      // Observe subsequent focus changes; never steal focus during a held gesture.
      const active = activeSchema.parse(JSON.parse((await run`hyprctl -j activewindow`).stdout))
      const identity = JSON.stringify(active)
      if (identity !== previous) {
        previous = identity
        trace.push({ elapsedMs: Date.now() - started, ...active })
      }
    }
    await sleep(250)
  }
  const result = await completion
  process.exitCode = result.exitCode ?? 1
} catch (error) {
  await benchmark.kill('SIGTERM')
  await completion
  process.exitCode = 1
  console.error(error instanceof Error ? error.message : 'Native benchmark failed')
} finally {
  const directory = resolve('test-results/native')
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolve(directory, 'planar-focus-trace.json'),
    JSON.stringify(
      {
        compositor: hyprland ? 'hyprland' : 'native-window-manager',
        activationCount,
        activationResults,
        activated,
        trace,
      },
      null,
      2,
    ),
  )
}
