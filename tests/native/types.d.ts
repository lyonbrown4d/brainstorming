import type {} from 'mocha'
import type {} from '@wdio/types'
import type {} from '@wdio/globals/types'

// WDIO 9 forwards documented ChromeDriver CLI arguments but omits these types.
declare global {
  namespace WebdriverIO {
    interface ChromedriverOptions {
      allowedIps?: string[]
      allowedOrigins?: string[]
    }
  }
}
