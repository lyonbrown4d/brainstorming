import { lazy, Suspense } from 'react'
import { CircleHelp } from 'lucide-react'
import { loadBrandMarkers } from '@shared/markerIcons'
import { markerOptions } from '@renderer/components/metadata/markers'

const BrandIcon = lazy(async () => {
  await loadBrandMarkers()
  const module = await import('@renderer/components/metadata/BrandMarkerIcon')
  return { default: module.BrandMarkerIcon }
})
export const MarkerIcon = ({
  marker,
  className = 'size-4',
}: {
  marker: string
  className?: string
}) => {
  const known = markerOptions.find((option) => option.value === marker)
  if (known) return <known.Icon className={className} aria-label={known.title} />
  const fallback = <CircleHelp className={className} aria-label={`图标 ${marker}`} />
  return marker.startsWith('simple-icons:') ? (
    <Suspense fallback={fallback}>
      <BrandIcon marker={marker} className={className} />
    </Suspense>
  ) : (
    fallback
  )
}
