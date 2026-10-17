import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

export type PreviewURLPolicy = (url: string) => Promise<boolean>

export const normalizePreviewURL = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export const isPublicPreviewAddress = (value: string): boolean => {
  try {
    const address = ipaddr.process(value)
    return address.range() === 'unicast'
  } catch {
    return false
  }
}

export const resolvePublicPreviewAddress = async (hostname: string) => {
  const host = hostname.replace(/^\[|\]$/g, '')
  const addresses = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6 }]
    : await lookup(host, { all: true, verbatim: true })
  // Mixed public/private answers are refused; do not let address selection bypass the policy.
  if (!addresses.length || addresses.some(({ address }) => !isPublicPreviewAddress(address))) {
    throw new Error('Preview target is outside the public network')
  }
  const address = addresses[0]
  if (!address) throw new Error('Preview host has no public address')
  return address
}

export const allowPublicPreviewURL: PreviewURLPolicy = async (value) => {
  const normalized = normalizePreviewURL(value)
  if (!normalized) return false
  try {
    await resolvePublicPreviewAddress(new URL(normalized).hostname)
    return true
  } catch {
    return false
  }
}
