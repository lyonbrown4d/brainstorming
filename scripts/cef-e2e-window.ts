import { readlink, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $, sleep } from 'zx'
import { z } from 'zod'
import { nativeE2E } from '@project/config/native-e2e'

const clientsSchema = z.array(
  z.object({
    address: z.string().regex(/^0x[\da-f]+$/i),
    pid: z.number().int(),
    mapped: z.boolean(),
    hidden: z.boolean(),
    size: z.tuple([z.number(), z.number()]),
  }),
)

/** Prepare only this run's window once; no focus polling or activation during gestures. */
export const prepareCefWindow = async (pid: number): Promise<void> => {
  if (!nativeE2E.hyprland) return
  if ((await readlink(`/proc/${pid}/exe`)) !== (await realpath(nativeE2E.binary)))
    throw new Error('The compositor target is not this run’s native binary')
  const run = $({ quiet: true, timeout: '3s' })
  const started = Date.now()
  while (Date.now() - started < 10_000) {
    const clients = clientsSchema.parse(JSON.parse((await run`hyprctl -j clients`).stdout))
    const main = clients.find(
      (client) => client.pid === pid && client.mapped && !client.hidden && client.size[1] > 400,
    )
    if (!main) {
      await sleep(100)
      continue
    }
    const target = `address:${main.address}`
    const commands = [
      `hl.dsp.window.float({ window = "${target}", action = "on" })`,
      `hl.dsp.window.center({ window = "${target}" })`,
      `hl.dsp.focus({ window = "${target}" })`,
    ]
    for (const command of commands) {
      if ((await run`hyprctl dispatch ${command}`).stdout.trim() !== 'ok')
        throw new Error('Hyprland rejected native test window preparation')
    }
    await writeFile(
      join(nativeE2E.artifacts, `cef-window-${nativeE2E.worker}.json`),
      JSON.stringify({ pid, address: main.address, activationCount: 1 }, null, 2),
    )
    return
  }
  throw new Error('The native main window did not become visible to the compositor')
}
