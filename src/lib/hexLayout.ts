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
  positions: PlotPosition[]
  radius: number
  width: number
  height: number
}

/** Ported from the mockup's gardenHTML: rows of pointy-top hexagons, centered. */
export function layoutGarden(plots: number, width = 360, height = 290, pad = 14): GardenLayout {
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

  return { positions, radius, width, height }
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
