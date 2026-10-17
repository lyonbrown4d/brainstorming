import { useMessages } from '@renderer/i18n/useMessages'

import { Icon } from '@iconify/react/offline'
import { CircleHelp } from 'lucide-react'
import { brandMarkerIcon } from '@shared/markerIcons'

export const BrandMarkerIcon = ({
  marker,
  className = 'size-4',
}: {
  marker: string
  className?: string
}) => {
  const { translate } = useMessages()

  const icon = brandMarkerIcon(marker)
  return icon ? (
    <Icon icon={icon} className={className} aria-label={marker.slice(13)} />
  ) : (
    <CircleHelp
      className={className}
      aria-label={translate('unknownIconValue0', { value0: marker })}
    />
  )
}
