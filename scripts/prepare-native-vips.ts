import { digest, download, exists } from '@project/scripts/native-vips-io'
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { $ } from 'zx'
import { prepareMacOS } from '@project/scripts/native-vips-macos'
import {
  androidSDKDirectory,
  configuredAndroidNDK,
  nativeVipsCache,
  nativeVipsManifestSchema,
  repository,
} from '@project/config/native-vips'

const manifest = nativeVipsManifestSchema.parse(
  JSON.parse(await readFile(join(repository, 'config/native-vips.lock.json'), 'utf8')),
)
const requested = process.argv.slice(2)
if (requested.some((item) => !['--ios', '--android', '--macos', '--all'].includes(item)))
  throw new Error('用法：pnpm native:vips --ios | --android | --macos | --all')
const ios = requested.includes('--all') || requested.includes('--ios')
const android = requested.includes('--all') || requested.includes('--android')
$.verbose = false

const prepareIOS = async (): Promise<void> => {
  if (process.platform !== 'darwin') throw new Error('iOS 原生框架准备需要 macOS。')
  const root = join(nativeVipsCache, manifest.ios.cacheDirectory)
  const archive = join(root, 'vips-dynamic-ios.zip')
  await download(manifest.ios.url, archive, manifest.ios.sha256)
  const extracted = join(root, 'extracted')
  const framework = join(extracted, 'vips.xcframework')
  if (!(await exists(framework))) {
    await mkdir(extracted, { recursive: true })
    await $`ditto -x -k ${archive} ${extracted}`
  }
  const symbols = [
    '_vips_init',
    '_vips_source_new_from_file',
    '_vips_image_new_from_source',
    '_vips_type_find',
    '_vips_thumbnail_image',
    '_vips_webpsave',
    '_vips_dzsave',
    '_g_object_unref',
  ]
  for (const slice of ['ios-arm64', 'ios-arm64_x86_64-simulator']) {
    const binary = join(framework, slice, 'vips.framework', 'vips')
    const output = (await $`nm -gU ${binary}`).stdout
    for (const symbol of symbols)
      if (!output.includes(symbol)) throw new Error(`iOS 原生框架缺少符号：${slice} ${symbol}`)
  }
  const target = join(repository, 'src-tauri/gen/apple/Frameworks/vips.xcframework')
  await mkdir(dirname(target), { recursive: true })
  await rm(target, { recursive: true, force: true })
  await cp(framework, target, { recursive: true, preserveTimestamps: true })
  console.info(`iOS libvips ${manifest.ios.version} 已校验并准备：${target}`)
}
const prepareAndroid = async (): Promise<void> => {
  const app = join(repository, 'src-tauri/gen/android/app')
  if (!(await exists(join(app, 'build.gradle.kts'))) && !(await exists(join(app, 'build.gradle'))))
    throw new Error('请先运行 pnpm tauri android init。')
  const ndk = configuredAndroidNDK ?? join(androidSDKDirectory, 'ndk', manifest.android.ndkVersion)
  const properties = await readFile(join(ndk, 'source.properties'), 'utf8')
  if (!properties.includes(`Pkg.Revision = ${manifest.android.ndkVersion}`))
    throw new Error(`Android NDK 版本必须为 ${manifest.android.ndkVersion}。`)
  const host =
    process.platform === 'darwin'
      ? 'darwin-x86_64'
      : process.platform === 'win32'
        ? 'windows-x86_64'
        : 'linux-x86_64'
  const toolchain = join(ndk, 'toolchains/llvm/prebuilt', host)
  const root = join(nativeVipsCache, manifest.android.cacheDirectory, 'jniLibs')
  // Four workers bound download sockets and open files; assets are streamed.
  const files = [...manifest.android.files]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let item = files.shift(); item; item = files.shift())
        await download(item.url, join(root, item.path), item.sha256)
    }),
  )
  const target = join(app, 'src/main/jniLibs')
  await mkdir(target, { recursive: true })
  await cp(root, target, { recursive: true, preserveTimestamps: true })
  const abis = {
    'arm64-v8a': 'aarch64-linux-android',
    'armeabi-v7a': 'arm-linux-androideabi',
    x86_64: 'x86_64-linux-android',
  }
  for (const [abi, triple] of Object.entries(abis)) {
    const runtime = join(toolchain, 'sysroot/usr/lib', triple, 'libc++_shared.so')
    if ((await digest(runtime)) !== manifest.android.cxxRuntimeSha256[abi])
      throw new Error(`Android NDK C++ 运行库校验失败：${abi}`)
    await copyFile(runtime, join(root, abi, 'libc++_shared.so'))
    await copyFile(runtime, join(target, abi, 'libc++_shared.so'))
    const symbols = (
      await $`${join(toolchain, 'bin/llvm-nm')} --dynamic --defined-only ${join(target, abi, 'libvips.so')}`
    ).stdout
    for (const symbol of [
      'vips_init',
      'vips_source_new_from_file',
      'vips_image_new_from_source',
      'vips_type_find',
      'vips_thumbnail_image',
      'vips_webpsave',
      'vips_dzsave',
    ])
      if (!symbols.includes(symbol)) throw new Error(`Android 图片库缺少符号：${abi} ${symbol}`)
    const gobject = (
      await $`${join(toolchain, 'bin/llvm-nm')} --dynamic --defined-only ${join(target, abi, 'libgobject-2.0.so')}`
    ).stdout
    if (!gobject.includes('g_object_unref'))
      throw new Error(`Android 图片库缺少对象释放符号：${abi}`)
    const libraries = (await readdir(join(target, abi))).filter((name) => name.endsWith('.so'))
    const available = new Set([
      ...libraries,
      'libc.so',
      'libm.so',
      'libdl.so',
      'liblog.so',
      'libandroid.so',
      'libjnigraphics.so',
    ])
    for (const library of libraries) {
      const elf = (
        await $`${join(toolchain, 'bin/llvm-readelf')} --program-headers --dynamic --wide ${join(target, abi, library)}`
      ).stdout
      for (const dependency of elf.matchAll(/\(NEEDED\)[^\n]*\[([^\]]+)\]/g))
        if (!dependency[1] || !available.has(dependency[1]))
          throw new Error(`Android 原生库缺少依赖：${abi}/${library} → ${dependency[1]}`)
      if (abi !== 'armeabi-v7a') {
        const segments = elf.split('\n').filter((line) => line.trim().startsWith('LOAD '))
        if (
          segments.length === 0 ||
          segments.some(
            (line) => Number.parseInt(line.trim().split(/\s+/).at(-1) ?? '', 16) < 16384,
          )
        )
          throw new Error(`Android 64 位原生库不满足 16 KiB 对齐：${abi}/${library}`)
      }
    }
  }
  const network = join(app, 'src/main/res/xml/network_security_config.xml')
  await mkdir(dirname(network), { recursive: true })
  await copyFile(join(repository, 'config/android-network-security.xml'), network)
  const manifestPath = join(app, 'src/main/AndroidManifest.xml')
  let xml = await readFile(manifestPath, 'utf8')
  if (xml.includes('android:networkSecurityConfig='))
    xml = xml.replace(
      /android:networkSecurityConfig="[^"]*"/,
      'android:networkSecurityConfig="@xml/network_security_config"',
    )
  else
    xml = xml.replace(
      /<application\b/,
      '<application android:networkSecurityConfig="@xml/network_security_config"',
    )
  await writeFile(manifestPath, xml)
  console.info(
    `Android libvips ${manifest.android.version} 与 NDK ${manifest.android.ndkVersion} C++ 运行库已准备：${target}`,
  )
}
try {
  if (ios) await prepareIOS()
  if (android) await prepareAndroid()
  if (
    requested.includes('--macos') ||
    requested.includes('--all') ||
    (requested.length === 0 && process.platform === 'darwin')
  )
    await prepareMacOS()
} catch (error) {
  console.error(error instanceof Error ? error.message : '原生图片库准备失败。')
  process.exitCode = 1
}
