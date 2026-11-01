import 'dotenv/config'
import { mkdir, statfs } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $ } from 'zx'
import { stageDeb, stageNativeBuild } from '@project/scripts/flatpak-stage'

const appId = 'io.github.lyonbrown4d.brainstorming'
const runtimeBranch = '50'
const flatpakRemote = 'https://dl.flathub.org/repo/flathub.flatpakrepo'
const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
const targetDirectory = join(repository, 'src-tauri/target')
const flatpakDirectory = join(targetDirectory, 'release/bundle/flatpak')
const inputDirectory = join(flatpakDirectory, 'input')
const minimumFreeBytes = 12 * 1024 ** 3
const builderApp = 'org.flatpak.Builder'

const ensureHostTools = async (needsDebTool: boolean): Promise<string[]> => {
  const missing: string[] = []
  const tools = ['flatpak', 'desktop-file-validate', 'appstreamcli']
  if (needsDebTool) tools.push('dpkg-deb')
  for (const tool of tools) {
    try {
      await $({ quiet: true, timeout: 30_000 })`command -v ${tool}`
    } catch {
      missing.push(tool)
    }
  }
  return missing
}

const hasFlatpakBuilder = async (): Promise<boolean> => {
  try {
    await $({ quiet: true, timeout: 30_000 })`flatpak-builder --version`
    return false
  } catch {
    try {
      await $({
        quiet: true,
        timeout: 30_000,
      })`flatpak run --user --command=flatpak-builder ${builderApp} --version`
      return true
    } catch {
      throw new Error(
        `缺少 flatpak-builder。可安装主机工具，或配置用户级 Flathub remote 后运行 pnpm tsx scripts/build-flatpak.ts --install-tools（安装 GNOME SDK 与 ${builderApp}）。`,
      )
    }
  }
}

const checkFreeSpace = async (): Promise<void> => {
  const { bavail, bsize } = await statfs(repository)
  const freeBytes = bavail * bsize
  if (freeBytes < minimumFreeBytes) {
    throw new Error(
      `Flatpak 构建至少需要 12 GiB 可用空间；${targetDirectory} 当前约有 ${(freeBytes / 1024 ** 3).toFixed(1)} GiB。`,
    )
  }
}

const installFlatpakTools = async (): Promise<void> => {
  await checkFreeSpace()
  try {
    const remotes = await $({
      quiet: true,
      timeout: 30_000,
    })`flatpak remotes --user --columns=name`
    if (!remotes.stdout.split(/\s+/).includes('flathub')) throw new Error('Flathub missing')
  } catch {
    throw new Error(
      '用户级 Flathub remote 不存在。先按需添加：flatpak remote-add --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo；脚本不会修改 remote 配置。',
    )
  }
  await $({
    timeout: 20 * 60_000,
  })`flatpak install --user --assumeyes --noninteractive flathub org.gnome.Sdk//${runtimeBranch} ${builderApp}`
}

const ensureTools = async (installTools: boolean, needsDebTool: boolean): Promise<boolean> => {
  const missing = await ensureHostTools(needsDebTool)
  if (missing.length > 0) {
    throw new Error(
      `缺少工具：${missing.join(', ')}。Ubuntu/Debian 可运行：sudo apt install flatpak dpkg-dev desktop-file-utils appstream；或使用已安装的官方 ${builderApp}。`,
    )
  }
  if (installTools) await installFlatpakTools()

  const useFlatpakBuilder = await hasFlatpakBuilder()
  for (const ref of [`org.gnome.Platform//${runtimeBranch}`, `org.gnome.Sdk//${runtimeBranch}`]) {
    try {
      await $({ quiet: true, timeout: 30_000 })`flatpak info --show-commit ${ref}`
    } catch {
      throw new Error(
        `Flatpak runtime 未安装：${ref}。先从已配置的 remote 安装：flatpak install --user flathub ${ref}。`,
      )
    }
  }
  return useFlatpakBuilder
}

const buildDeb = async (explicitDeb: string): Promise<string> => {
  const deb = resolve(repository, explicitDeb)
  try {
    await $({ timeout: 30_000 })`dpkg-deb --info ${deb}`
  } catch {
    throw new Error(`指定的 --deb 不是可读取的 Debian 包：${deb}`)
  }
  return deb
}

const buildNative = async (skipBuild: boolean): Promise<string> => {
  if (!skipBuild) {
    await $({
      cwd: repository,
      timeout: 45 * 60_000,
    })`pnpm tauri build --no-bundle`
  }
  return join(targetDirectory, 'release')
}

const validateMetadata = async (): Promise<void> => {
  const desktop = 'config/flatpak/io.github.lyonbrown4d.brainstorming.desktop'
  const metainfo = 'config/flatpak/io.github.lyonbrown4d.brainstorming.metainfo.xml'
  await $({ cwd: repository, timeout: 30_000 })`desktop-file-validate ${desktop}`
  await $({
    cwd: repository,
    timeout: 30_000,
  })`appstreamcli validate --no-net --explain ${metainfo}`
}

const buildFlatpak = async (useFlatpakBuilder: boolean): Promise<string> => {
  const buildDirectory = join(flatpakDirectory, 'build')
  const repoDirectory = join(flatpakDirectory, 'repo')
  const stateDirectory = join(flatpakDirectory, 'builder-state')
  const manifest = 'config/flatpak/manifest.json'
  if (useFlatpakBuilder) {
    await $({
      cwd: repository,
      timeout: 60 * 60_000,
    })`flatpak run --user --command=flatpak-builder ${builderApp} --force-clean --state-dir=${stateDirectory} --repo=${repoDirectory} ${buildDirectory} ${manifest}`
  } else {
    await $({
      cwd: repository,
      timeout: 60 * 60_000,
    })`flatpak-builder --force-clean --state-dir=${stateDirectory} --repo=${repoDirectory} ${buildDirectory} ${manifest}`
  }
  const architecture =
    process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : null
  if (!architecture) throw new Error(`Flatpak 不支持当前构建架构：${process.arch}`)
  const artifact = join(flatpakDirectory, `brainstorming-${architecture}.flatpak`)
  await $({
    cwd: repository,
    timeout: 10 * 60_000,
  })`flatpak build-bundle --runtime-repo=${flatpakRemote} ${repoDirectory} ${artifact} ${appId} stable`
  return artifact
}

const run = async (): Promise<void> => {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.info(
      '用法：pnpm tsx scripts/build-flatpak.ts [--app-dir <path> | --deb <path> | --skip-linux-build] [--install-tools]',
    )
    return
  }
  const parsed = parseArgs(args)
  if (
    (parsed.deb && parsed.appDirectory) ||
    (parsed.skipLinuxBuild && (parsed.deb || parsed.appDirectory))
  ) {
    throw new Error('--deb、--app-dir 与 --skip-linux-build 必须单独使用。')
  }
  if (!parsed.deb && !parsed.appDirectory && process.env.CARGO_TARGET_DIR) {
    const configured = resolve(repository, process.env.CARGO_TARGET_DIR)
    if (configured !== targetDirectory)
      throw new Error(
        'Flatpak 目前使用仓库默认的 src-tauri/target 输出目录，请清除 CARGO_TARGET_DIR 后重试。',
      )
  }
  const useFlatpakBuilder = await ensureTools(parsed.installTools, Boolean(parsed.deb))
  await checkFreeSpace()
  await validateMetadata()
  if (parsed.deb) await stageDeb(await buildDeb(parsed.deb), repository, inputDirectory)
  else
    await stageNativeBuild(
      parsed.appDirectory ?? (await buildNative(parsed.skipLinuxBuild)),
      repository,
      inputDirectory,
    )
  await mkdir(flatpakDirectory, { recursive: true })
  const artifact = await buildFlatpak(useFlatpakBuilder)
  console.info(`Flatpak 构建完成：${artifact}`)
}

interface BuildArguments {
  deb?: string
  appDirectory?: string
  skipLinuxBuild: boolean
  installTools: boolean
}

const parseArgs = (args: string[]): BuildArguments => {
  const result: BuildArguments = { skipLinuxBuild: false, installTools: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--skip-linux-build') result.skipLinuxBuild = true
    else if (arg === '--install-tools') result.installTools = true
    else if (arg === '--app-dir') {
      const path = args[index + 1]
      if (!path || path.startsWith('--')) throw new Error('--app-dir 需要指定 no-bundle 目录。')
      result.appDirectory = path
      index += 1
    } else if (arg?.startsWith('--app-dir=')) {
      const path = arg.slice('--app-dir='.length)
      if (!path) throw new Error('--app-dir 需要指定 no-bundle 目录。')
      result.appDirectory = path
    } else if (arg === '--deb') {
      const path = args[index + 1]
      if (!path || path.startsWith('--')) throw new Error('--deb 需要指定一个 .deb 路径。')
      result.deb = path
      index += 1
    } else if (arg?.startsWith('--deb=')) {
      const path = arg.slice('--deb='.length)
      if (!path) throw new Error('--deb 需要指定一个 .deb 路径。')
      result.deb = path
    } else {
      throw new Error(`不支持的参数：${arg}`)
    }
  }
  return result
}

try {
  await run()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Flatpak 构建失败。')
  process.exitCode = 1
}
