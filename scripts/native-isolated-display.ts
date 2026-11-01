import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $, sleep } from 'zx'
import { nativeE2E } from '@project/config/native-e2e'

/** A private compositor has its own input focus even while the user works elsewhere. */
export const withIsolatedDisplay = async (
  directory: string,
  benchmark: boolean,
  run: (environment: NodeJS.ProcessEnv) => Promise<void>,
): Promise<void> => {
  await mkdir(nativeE2E.artifacts, { recursive: true })
  let startup = ''
  // Portal helpers are activated while the compositor starts. Give only this
  // private bus its future Wayland socket, so they do not inherit an empty or
  // unrelated desktop display and block Shell startup waiting for GTK.
  await $({
    quiet: true,
    timeout: '10s',
  })`dbus-update-activation-environment WAYLAND_DISPLAY=brainstorming-e2e GDK_BACKEND=wayland XDG_RUNTIME_DIR`
  const server = $({
    quiet: true,
    nothrow: true,
  })`gnome-shell --wayland --headless --virtual-monitor 1920x1080@60 --wayland-display brainstorming-e2e`
  const collect = (chunk: Buffer) => {
    startup = (startup + chunk.toString()).slice(-65_536)
  }
  server.stdout.on('data', collect)
  server.stderr.on('data', collect)
  const state = { exited: false }
  const result = server.then((output) => {
    state.exited = true
    return output
  })
  const hasExited = (): boolean => state.exited
  try {
    const started = Date.now()
    // Cold private desktop services can consume a D-Bus activation timeout.
    // This is infrastructure startup only; application/test deadlines stay intact.
    const startupTimeout = 60_000
    let display: string | undefined
    let authority: string | undefined
    while (Date.now() - started < startupTimeout && !state.exited) {
      display = /Using public X11 display (:\d+)/.exec(startup)?.[1]
      authority = (await readdir(directory)).find((name) =>
        name.startsWith('.mutter-Xwaylandauth.'),
      )
      if (display && authority && startup.includes('GNOME Shell started')) break
      await sleep(100)
    }
    if (!display || !authority || state.exited || !startup.includes('GNOME Shell started'))
      throw new Error('The isolated GNOME/XWayland display did not start within 60 seconds')
    const environment = {
      ...process.env,
      DISPLAY: display,
      XAUTHORITY: join(directory, authority),
      GDK_BACKEND: 'x11',
      XDG_SESSION_TYPE: 'x11',
    }
    const command = $({ quiet: true, env: environment, timeout: '10s' })
    // Update only the private D-Bus started by this runner, never systemd/user's bus.
    await command`dbus-update-activation-environment DISPLAY XAUTHORITY GDK_BACKEND XDG_RUNTIME_DIR`
    const graphics = await command`glxinfo -B`
    await writeFile(join(nativeE2E.artifacts, 'isolated-graphics.txt'), graphics.stdout)
    if (benchmark && !graphics.stdout.includes('Accelerated: yes'))
      throw new Error('The isolated benchmark requires hardware GL acceleration')
    await run(environment)
  } finally {
    if (!state.exited) {
      await server.kill('SIGTERM')
      await Promise.race([result, sleep(5000)])
      if (!hasExited()) await server.kill('SIGKILL')
    }
    const output = await result
    await writeFile(
      join(nativeE2E.artifacts, 'isolated-compositor.log'),
      output.stdout + output.stderr,
    )
  }
}
