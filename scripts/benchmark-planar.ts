import 'dotenv/config'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { $ } from 'zx'
import { z } from 'zod'
import { nativeE2E } from '@project/config/native-e2e'

const { values } = parseArgs({
  options: {
    gpu: { type: 'boolean', default: false },
    reference: { type: 'boolean', default: false },
  },
})
if (values.gpu && values.reference) throw new Error('Choose GPU or SVG reference, not both')

// Window preparation belongs to the CEF harness; never run a second focus loop.
await $({
  stdio: 'inherit',
  timeout: '180s',
  env: {
    ...process.env,
    BRAINSTORMING_BENCHMARK_RUNS: '5',
    BRAINSTORMING_EXPECT_GPU: values.gpu ? '1' : '0',
    BRAINSTORMING_EXPECT_SVG: values.gpu ? '0' : '1',
    BRAINSTORMING_GPU_REFERENCE: values.reference ? '1' : '0',
  },
})`${nativeE2E.pnpmExecutable} test:e2e --spec tests/native/canvas-performance.spec.ts`

// Preserve this five-run cohort when a later functional suite writes its samples.
const raw = resolve('test-results/native/planar-benchmark-samples.json')
await copyFile(resolve('test-results/native/brainstorming-2d-performance.json'), raw)
const graphics = z
  .object({ renderer: z.string(), vendor: z.string(), userAgent: z.string() })
  .parse(JSON.parse(await readFile(resolve('test-results/native/cef-graphics.json'), 'utf8')))
if (/llvmpipe|softpipe|swiftshader|software rasterizer/i.test(graphics.renderer))
  throw new Error(`Performance sampling used a software graphics backend: ${graphics.renderer}`)
const records = z
  .array(z.record(z.string(), z.unknown()))
  .parse(JSON.parse(await readFile(raw, 'utf8')))
const drag = z.object({
  fps: z.number().positive(),
  p95: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  ratio: z.number().positive(),
  zoom: z.number().positive(),
  mounted: z.number().int().positive(),
  renderer: z.enum(['svg', 'webgl']),
})
const samples = records
  .filter((sample) => sample.kind === 'drag')
  .map((sample) => drag.parse(sample))
if (samples.length !== 5) throw new Error('Expected five measured drags after warmup')
const environments = samples.map((sample) =>
  JSON.stringify({
    width: sample.width,
    height: sample.height,
    ratio: sample.ratio,
    zoom: sample.zoom,
    mounted: sample.mounted,
    renderer: sample.renderer,
  }),
)
if (new Set(environments).size !== 1)
  throw new Error('Benchmark geometry or renderer changed between samples')
const fps = samples.map((sample) => sample.fps).sort((a, b) => a - b)
const mean = fps.reduce((sum, value) => sum + value, 0) / fps.length
const variation =
  Math.sqrt(fps.reduce((sum, value) => sum + (value - mean) ** 2, 0) / fps.length) / mean
const summary = {
  measurement: 'CEF synthetic 2D root-drag render throughput; not physical presentation FPS',
  warmupRuns: 1,
  measuredRuns: 5,
  fps,
  medianFps: fps[2],
  meanFps: mean,
  coefficientOfVariation: variation,
  stable: variation <= 0.1,
  environment: samples[0],
  graphics,
  raw,
}
await writeFile(
  resolve('test-results/native/planar-benchmark-summary.json'),
  JSON.stringify(summary, null, 2),
)
console.info('CEF 2D benchmark', summary)
if (!summary.stable) throw new Error('Drag FPS variation exceeded 10%; inspect the saved samples')
