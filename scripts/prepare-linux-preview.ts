import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { $ } from 'zx'
import { repository } from '@project/config/native-vips'

/** Package-manager owned files only; this build never writes the host desktop. */
export const prepareLinuxPreview = async (args: readonly string[]): Promise<string> => {
  const targetIndex = args.indexOf('--target')
  const target =
    args.find((arg) => arg.startsWith('--target='))?.slice(9) ??
    (targetIndex < 0 ? undefined : args[targetIndex + 1])
  const targetArgs = target ? ['--target', target] : []
  const debug = args.includes('--debug')
  const profile = debug ? [] : ['--release']
  await $({
    cwd: repository,
    timeout: 600_000,
  })`cargo build --manifest-path src-tauri/Cargo.toml --no-default-features --bin brainstorming-thumbnailer ${targetArgs} ${profile}`
  const directory = process.env.CARGO_TARGET_DIR
    ? resolve(repository, process.env.CARGO_TARGET_DIR)
    : join(repository, 'src-tauri/target')
  const binary = join(
    directory,
    ...(target ? [target] : []),
    debug ? 'debug' : 'release',
    'brainstorming-thumbnailer',
  )
  const files = {
    '/usr/bin/brainstorming-thumbnailer': binary,
    '/usr/share/thumbnailers/brainstorming.thumbnailer': join(
      repository,
      'src-tauri/shell-preview/linux/brainstorming.thumbnailer',
    ),
    '/usr/share/mime/packages/brainstorming.xml': join(
      repository,
      'src-tauri/shell-preview/linux/brainstorming.xml',
    ),
  }
  const configDirectory = join(repository, 'src-tauri/target/shell-preview')
  await mkdir(configDirectory, { recursive: true })
  const config = join(configDirectory, 'tauri.linux-preview.conf.json')
  await writeFile(
    config,
    JSON.stringify({ bundle: { linux: { deb: { files }, rpm: { files } } } }, null, 2),
  )
  return config
}
