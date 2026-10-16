import writeFileAtomic from 'write-file-atomic'
export async function atomicWrite(path: string, contents: string | Uint8Array): Promise<void> {
  await writeFileAtomic(path, typeof contents === 'string' ? contents : Buffer.from(contents), {
    encoding: 'utf8',
    mode: 0o600,
    fsync: true,
  })
}
