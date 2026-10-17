import { APPEARANCE_STORAGE_KEY } from '@shared/appAppearance'
import { NativeAppearanceSync } from '@renderer/components/appearance/NativeAppearanceSync'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

/** Client-only Vite uses library effects; keep the unused SSR bootstrap inert. */
export const AppearanceProvider = ({ children }: { children: ReactNode }) => (
  <ThemeProvider
    attribute="data-theme"
    defaultTheme="system"
    storageKey={APPEARANCE_STORAGE_KEY}
    enableSystem
    enableColorScheme
    scriptProps={{ type: 'application/x-trelyx-theme' }}
    disableTransitionOnChange
  >
    <NativeAppearanceSync />
    {children}
  </ThemeProvider>
)
