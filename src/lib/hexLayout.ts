/** Honeycomb row layouts per plot-tier, so the garden always looks deliberate. */
export const PLOT_ROWS: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  3: [2, 1],
  7: [2, 3, 2],
  12: [3, 4, 3, 2],
  19: [3, 4, 5, 4, 3],
}

export interface PlotPosition {
  x: number
  y: number
}

export interface GardenLayout {
  /** Owned plots — never resized or repositioned by a trailing locked tier. */
  positions: PlotPosition[]
  /** Faint next-tier outlines, on the exact same grid (radius, row spacing, column spacing) as positions. */
  lockedPositions: PlotPosition[]
  radius: number
  width: number
  height: number
}

/**
 * Ported from the mockup's gardenHTML: rows of pointy-top hexagons, centered.
 *
 * `lockedCount` plots are appended on the same grid as the real ones: the
 * real tier's own row shape and hex size are computed first and never
 * change, then locked hexes extend existing rows symmetrically outward
 * (same row y, same column spacing) and add further rows below using the
 * next tier's row counts. The tiers' row tables aren't nested subsets of
 * each other, so a handful of rows across some tier transitions land one
 * hex off-center rather than perfectly centered — real plots staying fixed
 * takes priority over that.
 */
export function layoutGarden(plots: number, lockedCount = 0, width = 360, height = 290, pad = 14): GardenLayout {
  const rows = PLOT_ROWS[plots] ?? [1]
  const sqrt3 = Math.sqrt(3)
  const maxRow = Math.max(...rows)
  const radius = Math.min(
    54,
    (width - 2 * pad) / (maxRow * sqrt3),
    (height - 2 * pad - 30) / ((rows.length - 1) * 1.5 + 2),
  )
  const hexWidth = sqrt3 * radius
  const gridHeight = (rows.length - 1) * 1.5 * radius + 2 * radius
  const top = (height - gridHeight) / 2 + radius + 14

  const positions: PlotPosition[] = []
  rows.forEach((count, rowIndex) => {
    const y = top + rowIndex * 1.5 * radius
    for (let col = 0; col < count; col++) {
      const x = width / 2 + (col - (count - 1) / 2) * hexWidth
      positions.push({ x, y })
    }
  })

  const lockedPositions: PlotPosition[] = []
  if (lockedCount > 0) {
    const targetRows = PLOT_ROWS[plots + lockedCount] ?? rows
    const rowCount = Math.max(targetRows.length, rows.length)
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const y = top + rowIndex * 1.5 * radius
      const realN = rows[rowIndex] ?? 0
      const targetN = targetRows[rowIndex] ?? 0
      const extra = targetN - realN
      for (let k = 0; k < extra; k++) {
        const step = Math.floor(k / 2) + 1
        const side = k % 2 === 0 ? 1 : -1
        const colOffset = realN === 0
          ? (k - (extra - 1) / 2)
          : side * ((realN - 1) / 2 + step)
        lockedPositions.push({ x: width / 2 + colOffset * hexWidth, y })
      }
    }
  }

  return { positions, lockedPositions, radius, width, height }
}

/** A pointy-top regular hexagon's vertices, as an SVG `<polygon points>` string. */
export function hexPoints(radius: number, cx = 0, cy = 0): string {
  return Array.from({ length: 6 }, (_, k) => {
    const angle = (Math.PI / 180) * (60 * k - 90)
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}
