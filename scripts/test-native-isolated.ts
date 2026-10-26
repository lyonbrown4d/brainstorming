import 'dotenv/config'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'zx'
import { withIsolatedDisplay } from '@project/scripts/native-isolated-display'
import { nativeE2E } from '@project/config/native-e2e'

if (process.platform !== 'linux') throw new Error('Isolated displays are a Linux test option')

const arguments_ = process.argv.slice(2)
const session = arguments_[0] === '--session'
const directory = session ? arguments_[1] : await mkdtemp(join(tmpdir(), 'bsg-'))
if (!directory) throw new Error('Missing isolated runtime directory')
const forwarded = session ? arguments_.slice(2) : arguments_
const benchmark = forwarded[0] === '--benchmark'
const commandArguments = benchmark ? forwarded.slice(1) : forwarded

if (session) {
  await withIsolatedDisplay(directory, benchmark, async (environment) => {
    const run = $({ stdio: 'inherit', env: environment, timeout: '12m' })
    if (benchmark) await run`${nativeE2E.pnpmExecutable} benchmark:2d ${commandArguments}`
    else await run`${nativeE2E.pnpmExecutable} test:e2e ${commandArguments}`
  })
} else {
  try {
    for (const name of ['data', 'config', 'cache']) await mkdir(join(directory, name))
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_RUNTIME_DIR: directory,
      XDG_DATA_HOME: join(directory, 'data'),
      XDG_CONFIG_HOME: join(directory, 'config'),
      XDG_CACHE_HOME: join(directory, 'cache'),
      XDG_CURRENT_DESKTOP: 'GNOME',
      GSETTINGS_BACKEND: 'memory',
      GIO_USE_VFS: 'local',
    }
    delete environment.DISPLAY
    delete environment.WAYLAND_DISPLAY
    delete environment.HYPRLAND_INSTANCE_SIGNATURE
    delete environment.XAUTHORITY
    // Reuse the selected Node and pnpm engine across private XDG directories.
    await $({
      stdio: 'inherit',
      env: environment,
      timeout: '15m',
    })`dbus-run-session -- ${process.execPath} --import tsx scripts/test-native-isolated.ts --session ${directory} ${forwarded}`
  } finally {
    // Private D-Bus services can release their FUSE mounts just after bus exit.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
