import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { $ } from 'zx'
import { z } from 'zod'
import { nativeVipsCache, repository } from '@project/config/native-vips'
import { digest, download, exists } from '@project/scripts/native-vips-io'

const platformSchema = z.object({
  package: z.string(),
  packageVersion: z.string(),
  libvipsVersion: z.string(),
  url: z.url(),
  sha256: z.string().optional(),
  integrity: z.string(),
  binary: z.string(),
  binarySha256: z.string().optional(),
  cacheDirectory: z.string(),
})
const schema = z.object({
  schemaVersion: z.literal(1),
  source: z.url(),
  license: z.string(),
  platforms: z.record(z.string(), platformSchema),
})

export const prepareMacOS = async (): Promise<string> => {
  if (process.platform !== 'darwin') throw new Error('macOS 原生动态库准备需要 macOS。')
  const lock = schema.parse(
    JSON.parse(await readFile(join(repository, 'config/native-vips-macos.lock.json'), 'utf8')),
  )
  const platform = lock.platforms[process.arch]
  if (!platform) throw new Error(`没有为 macOS ${process.arch} 固定原生图片库。`)
  const root = join(nativeVipsCache, platform.cacheDirectory)
  const archive = join(root, 'sharp-libvips.tgz')
  const extracted = join(root, 'extracted')
  const source = join(extracted, platform.binary)
  let installed: string | undefined
  try {
    const sharpRequire = createRequire(createRequire(import.meta.url).resolve('sharp'))
    installed = sharpRequire.resolve(`${platform.package}/package`)
  } catch {
    /* The pinned archive is used when build-tool optional dependencies are absent. */
  }
  const cached =
    platform.binarySha256 &&
    (await exists(source)) &&
    (await digest(source)) === platform.binarySha256
  if (cached) {
    /* A prior verified preparation remains usable without Node build dependencies. */
  } else if (
    installed &&
    platform.binarySha256 &&
    (await digest(join(dirname(installed), 'lib', basename(platform.binary)))) ===
      platform.binarySha256
  ) {
    await mkdir(extracted, { recursive: true })
    await cp(dirname(installed), join(extracted, 'package'), { recursive: true })
  } else {
    if (!platform.integrity.startsWith('sha512-'))
      throw new Error('原生包缺少固定 SHA-512 完整性。')
    await download(platform.url, archive, platform.integrity.slice(7), 'sha512')
    if (!(await exists(source))) {
      await mkdir(extracted, { recursive: true })
      await $`tar -xzf ${archive} -C ${extracted}`
    }
  }
  if (platform.binarySha256 && (await digest(source)) !== platform.binarySha256)
    throw new Error('macOS 原生图片库文件校验失败。')
  const libraries = join(root, 'lib')
  const target = join(libraries, basename(platform.binary))
  const stamp = join(root, 'prepared.json')
  const manifestHash = createHash('sha256').update(JSON.stringify(platform)).digest('hex')
  const prior: unknown = await readFile(stamp, 'utf8').then(
    (text) => JSON.parse(text) as unknown,
    () => null,
  )
  const prepared = z.object({ manifest: z.string(), binary: z.string() }).safeParse(prior)
  if (
    !prepared.success ||
    prepared.data.manifest !== manifestHash ||
    !(await exists(target)) ||
    (await digest(target)) !== prepared.data.binary
  ) {
    await mkdir(libraries, { recursive: true })
    await copyFile(source, target)
    await $`install_name_tool -id ${`@rpath/${basename(platform.binary)}`} ${target}`
    await $`codesign --force --sign - ${target}`
    await writeFile(stamp, JSON.stringify({ manifest: manifestHash, binary: await digest(target) }))
  }
  const dependencies = (await $`otool -L ${target}`).stdout
  if (/\n\s+\/(opt\/homebrew|usr\/local)\//.test(dependencies))
    throw new Error('macOS 原生图片库包含开发机绝对路径。')
  const symbols = (await $`nm -gU ${target}`).stdout
  for (const symbol of [
    '_vips_init',
    '_vips_source_new_from_file',
    '_vips_image_new_from_source',
    '_vips_type_find',
    '_vips_thumbnail_image',
    '_vips_webpsave',
    '_vips_dzsave',
    '_g_object_unref',
  ]) {
    if (!symbols.includes(symbol)) throw new Error(`macOS 原生图片库缺少符号：${symbol}`)
  }
  const licenses = join(root, 'licenses')
  await rm(licenses, { recursive: true, force: true })
  await cp(join(extracted, 'package'), licenses, {
    recursive: true,
    filter: (path) => !path.endsWith('.dylib'),
  })
  const config = {
    bundle: { macOS: { frameworks: [target] }, resources: { [licenses]: 'licenses/native-vips/' } },
  }
  await writeFile(
    join(repository, 'src-tauri/tauri.native-vips.conf.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  )
  console.info(`macOS libvips ${platform.libvipsVersion}：已校验 Sharp 单库及上游许可证。`)
  return libraries
}
