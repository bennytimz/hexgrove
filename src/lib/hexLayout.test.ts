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

describe('layoutGarden with locked plots', () => {
  it('leaves real positions exactly unchanged, whether or not locked plots are requested', () => {
    const bare = layoutGarden(12)
    const withLocked = layoutGarden(12, 7)
    expect(withLocked.positions).toEqual(bare.positions)
    expect(withLocked.lockedPositions).toHaveLength(7)
  })

  it('has no locked positions when lockedCount is 0', () => {
    expect(layoutGarden(12, 0).lockedPositions).toHaveLength(0)
  })

  it('snaps every row (real and locked together) onto one evenly spaced hex grid, for every tier transition', () => {
    const tiers = Object.keys(PLOT_ROWS).map(Number).sort((a, b) => a - b)
    for (let i = 0; i < tiers.length - 1; i++) {
      const [from, to] = [tiers[i], tiers[i + 1]]
      const layout = layoutGarden(from, to - from)
      const hexWidth = layout.radius * Math.sqrt(3)

      const rows = new Map<number, number[]>()
      for (const p of [...layout.positions, ...layout.lockedPositions]) {
        const key = Math.round(p.y * 100)
        if (!rows.has(key))
          rows.set(key, [])
        rows.get(key)!.push(p.x)
      }

      for (const xs of rows.values()) {
        xs.sort((a, b) => a - b)
        for (let k = 1; k < xs.length; k++) {
          expect(xs[k] - xs[k - 1]).toBeCloseTo(hexWidth, 5)
        }
      }
    }
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
