import { $ } from 'zx'
import { repository, nativeBuildEnvironment } from '@project/config/native-vips'
import { prepareMacOS } from '@project/scripts/native-vips-macos'

try {
  if (process.platform === 'darwin') {
    const directory = await prepareMacOS()
    await $({
      cwd: repository,
      env: nativeBuildEnvironment(directory),
    })`pnpm tauri build --config src-tauri/tauri.native-vips.conf.json ${process.argv.slice(2)}`
  } else await $({ cwd: repository })`pnpm tauri build ${process.argv.slice(2)}`
} catch (error) {
  console.error(error instanceof Error ? error.message : '桌面构建失败。')
  process.exitCode = 1
}
