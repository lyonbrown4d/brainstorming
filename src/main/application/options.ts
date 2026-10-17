export interface ApplicationOptions {
  readonly storageDirectory: string
  readonly rendererURL: string | undefined
  readonly platform: NodeJS.Platform
}
export const applicationOptions = Symbol('ApplicationOptions')
