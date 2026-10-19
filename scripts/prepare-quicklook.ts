import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { $ } from 'zx'
import { repository } from '@project/config/native-vips'

/** Build nested extensions before Tauri signs/notarizes the containing bundle. */
export const prepareQuickLook = async (
  args: readonly string[],
  adHoc: boolean,
): Promise<string> => {
  const source = join(repository, 'src-tauri/shell-preview/macos')
  const output = join(repository, 'src-tauri/target/quicklook')
  const targetOption = args.find((arg) => arg.startsWith('--target='))?.split('=')[1]
  const targetIndex = args.indexOf('--target')
  const target = targetOption ?? (targetIndex < 0 ? undefined : args[targetIndex + 1])
  const architectures =
    target === 'universal-apple-darwin'
      ? ['arm64', 'x86_64']
      : [target?.startsWith('x86_64') || (!target && process.arch === 'x64') ? 'x86_64' : 'arm64']
  const identity = process.env.APPLE_SIGNING_IDENTITY ?? (adHoc ? '-' : undefined)
  if (!identity)
    throw new Error(
      'Quick Look extensions require APPLE_SIGNING_IDENTITY (use - for local preview builds).',
    )
  const files: Record<string, string> = {}
  for (const kind of ['Thumbnail', 'Preview']) {
    const name = `Brainstorming${kind}`
    const bundle = join(output, `${name}.appex`)
    const contents = join(bundle, 'Contents')
    const executable = join(contents, 'MacOS', name)
    await rm(bundle, { recursive: true, force: true })
    await mkdir(join(contents, 'MacOS'), { recursive: true })
    await copyFile(join(source, `${kind}-Info.plist`), join(contents, 'Info.plist'))
    const entry = kind === 'Thumbnail' ? 'ThumbnailProvider.swift' : 'PreviewViewController.swift'
    const binaries: string[] = []
    for (const arch of architectures) {
      const binary = join(output, `${name}-${arch}`)
      await $({
        timeout: 120_000,
      })`xcrun swiftc -emit-executable -parse-as-library -application-extension -O -target ${`${arch}-apple-macosx13.3`} -module-name ${name} ${join(source, 'PreviewReader.swift')} ${join(source, entry)} -o ${binary} -framework AppKit -framework Quartz -framework QuickLookThumbnailing -lsqlite3 -Xlinker -e -Xlinker _NSExtensionMain`
      binaries.push(binary)
    }
    if (binaries.length > 1) await $`xcrun lipo -create ${binaries} -output ${executable}`
    else {
      const binary = binaries[0]
      if (!binary) throw new Error('Quick Look compiler produced no executable.')
      await copyFile(binary, executable)
    }
    await $`codesign --force --sign ${identity} --entitlements ${join(source, 'Entitlements.plist')} --options runtime ${bundle}`
    await $`codesign --verify --strict ${bundle}`
    files[`PlugIns/${name}.appex`] = bundle
  }
  const config = join(output, 'tauri.quicklook.conf.json')
  await writeFile(config, JSON.stringify({ bundle: { macOS: { files } } }, null, 2))
  return config
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(repository, 'scripts/prepare-quicklook.ts')
) {
  // Standalone compile verification does not install or register the extensions.
  const config = await prepareQuickLook(process.argv.slice(2), true)
  console.info(`Quick Look bundle configuration: ${config}`)
}
