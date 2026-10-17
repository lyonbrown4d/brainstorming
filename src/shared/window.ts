export type DesktopPlatform = 'macos' | 'windows' | 'linux' | 'ios' | 'android'

export interface WindowState {
  focused: boolean
  fullScreen: boolean
}

export const isWindowState = (value: unknown): value is WindowState => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'focused' in value &&
    typeof value.focused === 'boolean' &&
    'fullScreen' in value &&
    typeof value.fullScreen === 'boolean'
  )
}

export const hasWindowControls = (platform: DesktopPlatform): boolean =>
  platform !== 'ios' && platform !== 'android'
