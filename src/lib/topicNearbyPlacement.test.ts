import { describe, expect, it } from 'vitest'
import { getOverlappingArea, Position } from '@xyflow/system'
import { topicNearbyPlacement, topicNearbySize } from '@renderer/lib/topicNearbyPlacement'

const viewport = { x: 0, y: 0, width: 800, height: 600 }
const topic = { x: 300, y: 200, width: 160, height: 60 }
const size = topicNearbySize(false)

describe('nearby topic creation placement', () => {
  it('moves above the selected topic when a neighboring body occupies its lower tools', () => {
    const neighbor = { x: 320, y: 280, width: 180, height: 70 }
    const result = topicNearbyPlacement(topic, size, [neighbor], viewport)
    expect(result?.position).toBe(Position.Top)
    expect(result && getOverlappingArea(result.rectangle, neighbor)).toBe(0)
  })

  it('uses either horizontal side when both vertical positions are obstructed', () => {
    const obstacles = [
      { x: 300, y: 270, width: 160, height: 80 },
      { x: 300, y: 100, width: 160, height: 90 },
    ]
    const right = topicNearbyPlacement(topic, size, obstacles, viewport)
    expect(right?.position).toBe(Position.Right)
    const left = topicNearbyPlacement(
      topic,
      size,
      [...obstacles, { x: 480, y: 180, width: 100, height: 100 }],
      viewport,
    )
    expect(left?.position).toBe(Position.Left)
  })

  it('hides the nearby entry when all four positions are occupied or outside the visible canvas', () => {
    expect(topicNearbyPlacement(topic, size, [viewport], viewport)).toBeNull()
    expect(topicNearbyPlacement(topic, size, [], topic)).toBeNull()
  })
})
