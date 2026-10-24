import { requireDesktopAPI } from '@renderer/lib/desktop'

export const storyPrimaryModifier = (): 'Meta' | 'Control' =>
  ['macos', 'ios'].includes(requireDesktopAPI().platform) ? 'Meta' : 'Control'

/** Preview keyboard input must agree with the platform exposed by its API bridge. */
export const storyShortcut = (keys: string): string =>
  keys.replaceAll('Meta', storyPrimaryModifier())
