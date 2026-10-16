import { Icon } from '@iconify/react/offline'
import { CircleHelp } from 'lucide-react'
import { brandMarkerIcon } from '@shared/markerIcons'

export function BrandMarkerIcon({
  marker,
  className = 'size-4',
}: {
  marker: string
  className?: string
}) {
  const icon = brandMarkerIcon(marker)
  return icon ? (
    <Icon icon={icon} className={className} aria-label={marker.slice(13)} />
  ) : (
    <CircleHelp className={className} aria-label={`未知图标 ${marker}`} />
  )
}
