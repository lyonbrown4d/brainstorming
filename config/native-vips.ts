import 'dotenv/config'
import { homedir, platform } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const fileSchema = z.object({
  path: z.string(),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: z.url(),
})
export const nativeVipsManifestSchema = z.object({
  schemaVersion: z.literal(1),
  ios: z.object({
    version: z.string(),
    source: z.url(),
    license: z.string(),
    cacheDirectory: z.string(),
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  android: z.object({
    version: z.string(),
    source: z.url(),
    commit: z.string(),
    license: z.string(),
    cacheDirectory: z.string(),
    files: z.array(fileSchema).min(1),
    ndkVersion: z.string(),
    cxxRuntimeSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  }),
})
export type NativeVipsManifest = z.infer<typeof nativeVipsManifestSchema>
export const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
const configured = process.env.BRAINSTORMING_NATIVE_CACHE
const userCache =
  platform() === 'darwin'
    ? join(homedir(), 'Library', 'Caches')
    : platform() === 'win32'
      ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
      : (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'))
export const nativeVipsCache = configured ?? join(userCache, 'brainstorming', 'native-vips')
if (!isAbsolute(nativeVipsCache) || !relative(repository, nativeVipsCache).startsWith('..'))
  throw new Error('BRAINSTORMING_NATIVE_CACHE 必须为仓库外的绝对路径。')

export const nativeBuildEnvironment = (libraryDirectory: string): NodeJS.ProcessEnv => {
  return { ...process.env, VIPS_LIB_DIR: libraryDirectory }
}

export const androidSDKDirectory =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (platform() === 'darwin'
    ? join(homedir(), 'Library/Android/sdk')
    : platform() === 'win32'
      ? join(userCache, 'Android/Sdk')
      : join(homedir(), 'Android/Sdk'))
export const configuredAndroidNDK = process.env.ANDROID_NDK_HOME ?? process.env.ANDROID_NDK_ROOT
