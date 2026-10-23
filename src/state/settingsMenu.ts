import { create } from 'zustand'

export type SettingsSection = 'general' | 'canvas' | 'shortcuts' | 'about'
export const useSettingsRequest = create<{ section: SettingsSection | null }>(() => ({
  section: null,
}))
export const requestSettings = (section: SettingsSection = 'general'): void => {
  useSettingsRequest.setState({ section })
}
