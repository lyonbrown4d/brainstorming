import { $ } from 'zx'
import { repository, nativeBuildEnvironment } from '@project/config/native-vips'
import { prepareLinuxPreview } from '@project/scripts/prepare-linux-preview'
import { prepareQuickLook } from '@project/scripts/prepare-quicklook'
import { prepareMacOS } from '@project/scripts/native-vips-macos'

try {
  if (process.platform === 'darwin') {
    const directory = await prepareMacOS()
    const preview =
      process.env.APPLE_SIGNING_IDENTITY === '-' ||
      (process.argv.includes('--debug') && !process.env.APPLE_SIGNING_IDENTITY)
    const quickLookConfig = await prepareQuickLook(process.argv.slice(2), preview)
    const previewConfig = preview ? ['--config', 'src-tauri/tauri.preview.conf.json'] : []
    await $({
      cwd: repository,
      env: nativeBuildEnvironment(directory),
    })`pnpm tauri build --config src-tauri/tauri.native-vips.conf.json --config ${quickLookConfig} ${process.argv.slice(2)} ${previewConfig}`
  } else if (process.platform === 'linux') {
    const config = await prepareLinuxPreview(process.argv.slice(2))
    await $({ cwd: repository })`pnpm tauri build --config ${config} ${process.argv.slice(2)}`
  } else await $({ cwd: repository })`pnpm tauri build ${process.argv.slice(2)}`
} catch (error) {
  console.error(error instanceof Error ? error.message : '桌面构建失败。')
  process.exitCode = 1
}
