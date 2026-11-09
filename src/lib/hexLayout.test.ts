import { describe, expect, it } from 'vitest'
import { hexPoints, layoutGarden, PLOT_ROWS } from './hexLayout'

describe('PLOT_ROWS', () => {
  it('each tier\'s rows sum to its plot count', () => {
    for (const [plots, rows] of Object.entries(PLOT_ROWS)) {
      expect(rows.reduce((sum, n) => sum + n, 0)).toBe(Number(plots))
    }
  })
})

describe('layoutGarden', () => {
  it('produces one position per plot, for every known tier', () => {
    for (const plots of Object.keys(PLOT_ROWS).map(Number)) {
      expect(layoutGarden(plots).positions).toHaveLength(plots)
    }
  })

  it('falls back to a single plot for an unknown tier', () => {
    expect(layoutGarden(0).positions).toHaveLength(1)
    expect(layoutGarden(2).positions).toHaveLength(1)
  })

  it('centers rows horizontally around width / 2', () => {
    const { positions, width } = layoutGarden(3)
    const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
    expect(avgX).toBeCloseTo(width / 2, 0)
  })
})

describe('hexPoints', () => {
  it('returns 6 vertices, the first pointing straight up from center', () => {
    const points = hexPoints(10, 0, 0).split(' ')
    expect(points).toHaveLength(6)
    const [x, y] = points[0].split(',').map(Number)
    expect(x).toBeCloseTo(0, 1)
    expect(y).toBeCloseTo(-10, 1)
  })
})
