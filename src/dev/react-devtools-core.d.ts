/** Used subset of the official Flow API; upstream currently publishes no TS declarations.
 * https://github.com/facebook/react/tree/main/packages/react-devtools-core#backend-api
 */
declare module 'react-devtools-core' {
  export const initialize: () => void
  export const connectToDevTools: (options: {
    readonly host: string
    readonly port: number
    readonly retryConnectionDelay?: number
    readonly isAppActive?: () => boolean
  }) => void
}
