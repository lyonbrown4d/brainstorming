import lightLogo from '@renderer/assets/brand/logo-light.png'
import darkLogo from '@renderer/assets/brand/logo-dark.png'
import { cn } from '@renderer/lib/utils'

interface BrandLogoProps {
  className?: string
}

/** Decorative beside the wordmark; CSS also follows OS appearance before React mounts. */
export const BrandLogo = ({ className }: BrandLogoProps) => (
  <span aria-hidden="true" className={cn('inline-flex size-8 shrink-0', className)}>
    <img
      src={lightLogo}
      width={1254}
      height={1254}
      alt=""
      draggable={false}
      className="block size-full object-contain dark:hidden [@media(prefers-color-scheme:dark)]:[html:not([data-theme])_&]:hidden"
    />
    <img
      src={darkLogo}
      width={1254}
      height={1254}
      alt=""
      draggable={false}
      className="hidden size-full object-contain dark:block [@media(prefers-color-scheme:dark)]:[html:not([data-theme])_&]:block"
    />
  </span>
)
