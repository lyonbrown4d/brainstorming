import { chmod, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { $ } from 'zx'

const packageFileNames = ['brainstorming', 'libcef.so', 'chrome-sandbox', 'CREDITS.html'] as const
type PackageFileName = (typeof packageFileNames)[number]
const cefBinaryFiles = [
  'chrome-sandbox',
  'libcef.so',
  'libvk_swiftshader.so',
  'libvulkan.so.1',
  'v8_context_snapshot.bin',
  'vk_swiftshader_icd.json',
] as const
const cefResourceFiles = [
  'chrome_100_percent.pak',
  'chrome_200_percent.pak',
  'resources.pak',
  'icudtl.dat',
  'locales',
] as const

const findPackageFiles = async (root: string): Promise<Map<PackageFileName, string[]>> => {
  const found = new Map<PackageFileName, string[]>(packageFileNames.map((name) => [name, []]))
  const pending = [root]
  // Tauri's Debian bundle nests CEF libraries separately; locate required files without copying the full target tree.
  while (pending.length > 0) {
    const directory = pending.pop()
    if (!directory) continue
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (packageFileNames.includes(entry.name as PackageFileName)) {
        found.get(entry.name as PackageFileName)?.push(path)
      }
    }
  }
  return found
}

export const stageNativeBuild = async (
  appDirectory: string,
  repository: string,
  inputDirectory: string,
): Promise<void> => {
  const binaryDirectory = resolve(repository, appDirectory)
  const executable = join(binaryDirectory, 'brainstorming')
  try {
    await $({ timeout: 30_000 })`test -x ${executable}`
  } catch {
    throw new Error(`no-bundle 输出目录中缺少可执行文件：${executable}`)
  }
  await rm(inputDirectory, { recursive: true, force: true })
  const appBinDirectory = join(inputDirectory, 'usr/bin')
  await mkdir(appBinDirectory, { recursive: true })
  const licenseDirectory = join(inputDirectory, 'licenses')
  await mkdir(licenseDirectory, { recursive: true })
  await cp(executable, join(appBinDirectory, 'brainstorming'))
  for (const file of [...cefBinaryFiles, ...cefResourceFiles]) {
    const source = join(binaryDirectory, file)
    try {
      await cp(source, join(appBinDirectory, file), { recursive: true })
    } catch {
      throw new Error(`CEF SDK runtime 文件缺失：${source}`)
    }
  }
  const credits = join(binaryDirectory, 'CREDITS.html')
  try {
    await cp(credits, join(licenseDirectory, 'CREDITS.html'))
  } catch {
    throw new Error(`缺少 CEF/Chromium 第三方许可说明：${credits}`)
  }
  await chmod(join(appBinDirectory, 'brainstorming'), 0o755)
  await chmod(join(appBinDirectory, 'chrome-sandbox'), 0o755)
}

export const stageDeb = async (
  deb: string,
  repository: string,
  inputDirectory: string,
): Promise<void> => {
  await rm(inputDirectory, { recursive: true, force: true })
  await mkdir(inputDirectory, { recursive: true })
  await $({ cwd: repository, timeout: 60_000 })`dpkg-deb --extract ${deb} ${inputDirectory}`
  const files = await findPackageFiles(inputDirectory)
  const executable = join(inputDirectory, 'usr/bin/brainstorming')
  if (!files.get('brainstorming')?.includes(executable)) {
    throw new Error(`deb 中缺少预期的 /usr/bin/brainstorming：${deb}`)
  }
  if (files.get('libcef.so')?.length === 0) {
    throw new Error(`deb 中缺少 CEF 库 libcef.so：${deb}`)
  }
  const credits = files.get('CREDITS.html')?.[0]
  if (!credits) throw new Error(`deb 中缺少 CEF/Chromium 第三方许可说明：${deb}`)
  const licenseDirectory = join(inputDirectory, 'licenses')
  await mkdir(licenseDirectory, { recursive: true })
  await cp(credits, join(licenseDirectory, 'CREDITS.html'))
  // Zypak owns the Chromium sandbox inside Flatpak, so remove Debian's setuid bit.
  for (const helper of files.get('chrome-sandbox') ?? []) {
    await chmod(helper, 0o755)
  }
}
