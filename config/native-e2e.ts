import 'dotenv/config'
import { resolve } from 'node:path'
import { z } from 'zod'

const environment = z
  .object({
    WDIO_WORKER_ID: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
    HYPRLAND_INSTANCE_SIGNATURE: z.string().optional(),
    npm_execpath: z.string().min(1).optional(),
    BRAINSTORMING_E2E_BINARY: z.string().min(1).optional(),
    BRAINSTORMING_CEF_DEBUG_PORT: z.coerce.number().int().min(1024).max(65535).optional(),
  })
  .parse(process.env)

export const nativeE2E = {
  binary: resolve(
    environment.BRAINSTORMING_E2E_BINARY ??
      (process.platform === 'darwin'
        ? 'src-tauri/target/debug/bundle/macos/Brainstorming E2E.app/Contents/MacOS/brainstorming'
        : `src-tauri/target/debug/brainstorming${process.platform === 'win32' ? '.exe' : ''}`),
  ),
  worker: environment.WDIO_WORKER_ID ?? 'launcher',
  hyprland: process.platform === 'linux' && !!environment.HYPRLAND_INSTANCE_SIGNATURE,
  port: environment.BRAINSTORMING_CEF_DEBUG_PORT,
  artifacts: resolve('test-results/native'),
  pnpmExecutable: environment.npm_execpath ?? 'pnpm',
}
