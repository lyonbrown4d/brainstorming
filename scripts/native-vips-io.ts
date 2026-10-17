import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, rename } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { $ } from 'zx'
export const digest = async (
  path: string,
  algorithm: 'sha256' | 'sha512' = 'sha256',
): Promise<string> => {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest(algorithm === 'sha512' ? 'base64' : 'hex')
}
export const exists = async (path: string): Promise<boolean> => {
  return access(path).then(
    () => true,
    () => false,
  )
}
export const download = async (
  url: string,
  path: string,
  expected: string,
  algorithm: 'sha256' | 'sha512' = 'sha256',
): Promise<void> => {
  if (await exists(path)) {
    if ((await digest(path, algorithm)) === expected) return
    throw new Error(`缓存校验失败，请删除后重试：${path}`)
  }
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.download`
  if (await exists('/opt/homebrew/bin/aria2c'))
    await $`/opt/homebrew/bin/aria2c -x8 -s8 -k8M -c --auto-file-renaming=false --allow-overwrite=true --max-tries=5 --connect-timeout=20 --timeout=60 --console-log-level=warn --summary-interval=0 --dir=${dirname(temporary)} --out=${basename(temporary)} ${url}`
  else
    await $`curl --fail --location --silent --show-error --retry 4 --retry-all-errors --connect-timeout 20 --max-time 1800 --continue-at - --output ${temporary} ${url}`
  if ((await digest(temporary, algorithm)) !== expected)
    throw new Error(`上游原生库完整性不匹配：${url}`)
  await rename(temporary, path)
}
