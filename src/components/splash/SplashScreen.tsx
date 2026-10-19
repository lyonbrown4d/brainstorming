import { X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { LoadingIndicator } from '@renderer/components/feedback/LoadingIndicator'
import lightLogo from '@renderer/assets/brand/logo-compact-light.png'
import darkLogo from '@renderer/assets/brand/logo-compact-dark.png'
import loadingMap from '@renderer/assets/brand/loading-map.svg'
import { splashText } from '@renderer/splashI18n'
import type { AppLanguage } from '@shared/language'
import type { StartupPhase } from '@shared/startup'
import { cn } from '@renderer/lib/utils'

interface SplashScreenProps {
  readonly phase: StartupPhase
  readonly language: AppLanguage
  readonly retrying: boolean
  readonly onRetry: () => void
  readonly onQuit: () => void
}

/** A standalone React entry: share UI primitives without importing the workspace. */
export const SplashScreen = ({ phase, language, retrying, onRetry, onQuit }: SplashScreenProps) => {
  const failed = phase === 'failed'
  return (
    <section
      id="startup-screen"
      aria-label={splashText('screen', language)}
      aria-busy={!failed}
      data-state={phase}
      data-react-splash
      className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-canvas font-sans text-foreground antialiased select-none [text-rendering:optimizeLegibility]"
    >
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-18" aria-hidden="true" />
      <Button
        id="startup-quit"
        variant="ghost"
        size="icon-sm"
        type="button"
        aria-label={splashText('quit', language)}
        className="absolute top-3.5 right-3.5 z-1 size-7 text-muted-foreground"
        onClick={onQuit}
      >
        <X aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </Button>
      <div className="grid min-h-[min(360px,100dvh)] w-[min(100%,520px)] grid-rows-[auto_1fr_auto] px-8 pt-7 pb-6">
        <header className="flex items-center gap-[11px]">
          <span className="inline-flex size-10 shrink-0" aria-hidden="true">
            <img
              src={lightLogo}
              width="128"
              height="128"
              alt=""
              draggable={false}
              data-splash-logo="light"
              className="block size-full object-contain dark:hidden [@media(prefers-color-scheme:dark)]:[html:not([data-theme])_&]:hidden"
            />
            <img
              src={darkLogo}
              width="128"
              height="128"
              alt=""
              draggable={false}
              data-splash-logo="dark"
              className="hidden size-full object-contain dark:block [@media(prefers-color-scheme:dark)]:[html:not([data-theme])_&]:block"
            />
          </span>
          <h1 className="m-0 text-xl leading-[1.2] font-[620] tracking-[-0.025em]">
            Brainstorming
          </h1>
        </header>
        <div className="grid min-h-41 place-items-center" aria-hidden="true">
          <img
            src={loadingMap}
            width="264"
            height="132"
            alt=""
            data-startup-map
            className={cn(
              'h-auto w-[min(264px,100%)]',
              failed
                ? 'opacity-40'
                : 'animate-[loading-breathe_var(--loading-cycle)_ease-in-out_infinite] motion-reduce:animate-none',
            )}
          />
        </div>
        <footer className="grid min-h-[41px] justify-items-start gap-3 border-t border-border pt-4 text-xs leading-[1.6] text-muted-foreground">
          <div className="flex items-start gap-[9px]">
            {!failed && (
              <span data-startup-indicator className="mt-0.5 shrink-0">
                <LoadingIndicator />
              </span>
            )}
            <p
              id="startup-message"
              role={failed ? 'alert' : 'status'}
              aria-live="polite"
              className={cn('m-0 wrap-anywhere', failed && 'text-destructive')}
            >
              {splashText(phase, language)}
            </p>
          </div>
          {phase !== 'loading' && (
            <Button
              id="startup-retry"
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={retrying}
              onClick={onRetry}
            >
              {splashText('retry', language)}
            </Button>
          )}
        </footer>
      </div>
    </section>
  )
}
