import { observeDesktopSpatialDrag } from '@tests/native/desktop-pointer'
import type { SpatialDragChoice } from '@tests/native/independent-spatial'

/** Trusted desktop input is required: embedded WDIO 1.5 emits MouseEvents only. */
export const dragIndependentSpatialReal = async (choice: SpatialDragChoice): Promise<void> => {
  await observeDesktopSpatialDrag(choice)
}

/** Observe actual pointer events and GPU draws; no synthetic input or capture shim. */
export const sampleIndependentSpatialDrag = observeDesktopSpatialDrag
