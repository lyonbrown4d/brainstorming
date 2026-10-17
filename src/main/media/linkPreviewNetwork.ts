import { request as httpRequest, Agent as HttpAgent } from 'node:http'
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https'
import { Readable } from 'node:stream'
import type { PreviewURLPolicy } from '@main/media/linkPreviewPolicy'
import { normalizePreviewURL, resolvePublicPreviewAddress } from '@main/media/linkPreviewPolicy'

/** Pins each Node connection to the checked address; Chromium never performs a second DNS lookup. */
export const createPreviewNetwork = (allowURL: PreviewURLPolicy, signal: AbortSignal) => {
  const httpAgent = new HttpAgent({ keepAlive: false, maxSockets: 4, maxTotalSockets: 4 })
  const httpsAgent = new HttpsAgent({ keepAlive: false, maxSockets: 4, maxTotalSockets: 4 })
  let requestCount = 0
  const fetch = async (request: Request): Promise<Response> => {
    signal.throwIfAborted()
    requestCount += 1
    const normalized = normalizePreviewURL(request.url)
    if (
      requestCount > 256 ||
      !normalized ||
      !['GET', 'HEAD'].includes(request.method) ||
      !(await allowURL(normalized))
    ) {
      throw new Error('Preview request blocked')
    }
    const url = new URL(normalized)
    const address = await resolvePublicPreviewAddress(url.hostname)
    signal.throwIfAborted()
    const https = url.protocol === 'https:'
    const headers: Record<string, string> = { 'accept-encoding': 'identity' }
    for (const name of ['accept', 'accept-language', 'user-agent', 'range']) {
      const value = request.headers.get(name)
      if (value) headers[name] = value
    }
    return new Promise<Response>((resolve, reject) => {
      const outgoing = (https ? httpsRequest : httpRequest)(
        url,
        {
          method: request.method,
          agent: https ? httpsAgent : httpAgent,
          headers,
          signal,
          // Keep the URL hostname for Host/SNI and normal TLS certificate validation.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address])
            else callback(null, address.address, address.family)
          },
        },
        (incoming) => {
          try {
            const status = incoming.statusCode ?? 502
            if (status < 200 || status > 599) throw new Error('Invalid preview response status')
            const responseHeaders = new Headers()
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (value === undefined || ['connection', 'transfer-encoding'].includes(name))
                continue
              for (const entry of Array.isArray(value) ? value : [value])
                responseHeaders.append(name, entry)
            }
            if (request.method === 'HEAD' || [204, 205, 304].includes(status)) {
              incoming.resume()
              resolve(new Response(null, { status, headers: responseHeaders }))
              return
            }
            // Response streams retain backpressure; no page or image response is buffered in JS.
            resolve(
              new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
                status,
                headers: responseHeaders,
              }),
            )
          } catch {
            incoming.destroy()
            reject(new Error('Preview response is invalid'))
          }
        },
      )
      outgoing.once('error', () => {
        reject(new Error('Preview network request failed'))
      })
      outgoing.end()
    })
  }
  const dispose = () => {
    httpAgent.destroy()
    httpsAgent.destroy()
  }
  return { fetch, dispose }
}
