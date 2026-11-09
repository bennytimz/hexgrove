/** Ported from the mockup's plant rendering (SP, STAGE, plantSVG). */

export type PlantSpecies = 'daisy' | 'fern' | 'sprig' | 'tulip' | 'lotus' | 'hexbloom'

export interface SpeciesInfo {
  name: string
  color: string
  /** Watering-streak days to unlock, for rare species. 0 for common (reward-unlocked) species. */
  rare: number
}

export const SPECIES: Record<PlantSpecies, SpeciesInfo> = {
  daisy: { name: 'Daisy', color: '#FFD66B', rare: 0 },
  fern: { name: 'Glow fern', color: '#6EE0B0', rare: 0 },
  sprig: { name: 'Sprig tree', color: '#7BD88F', rare: 0 },
  tulip: { name: 'Dusk tulip', color: '#A895FF', rare: 7 },
  lotus: { name: 'Moon lotus', color: '#FF9DBB', rare: 14 },
  hexbloom: { name: 'Hexbloom', color: '#F6B221', rare: 30 },
}

export const STAGE_NAMES = ['Seed', 'Sprout', 'Leafy', 'Flourishing', 'Mature']

export interface PlantData {
  species: PlantSpecies
  stage: number
}

const GREEN = '#4FB88A'

function leaf(x: number, y: number, rot: number, rx = 4.2, ry = 1.9, fill = GREEN): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="${fill}"/>`
}

function hexPts(r: number, cx = 0, cy = 0): string {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90)
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

/** SVG markup for one plant, as a string (same approach as hexPoints). */
export function plantSvgMarkup(species: PlantSpecies, stage: number): string {
  if (stage === 0) {
    return `<g class="seedglow"><ellipse cx="0" cy="6" rx="8" ry="3" fill="#00000050"/><circle cx="0" cy="3.5" r="3.8" fill="#F6B221"/><circle cx="0" cy="3.5" r="7" fill="#F6B221" opacity=".18"/></g>`
  }

  const H = [0, 9, 19, 27, 34][stage]
  const col = SPECIES[species].color
  const top = 6 - H
  let s = `<ellipse cx="0" cy="6" rx="9" ry="3" fill="#00000045"/>`
  const stem = `<path d="M0 6 L0 ${top}" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`

  if (stage === 1) {
    return s + stem + leaf(-3.5, top + 2, -30, 3.6, 1.7) + leaf(3.5, top + 3, 30, 3.6, 1.7)
  }

  if (species === 'sprig') {
    const cr = [0, 0, 7, 9.5, 12][stage]
    const trunk = H * 0.45
    const cy = 6 - trunk - cr * 0.55
    s += `<rect x="-1.8" y="${6 - trunk}" width="3.6" height="${trunk}" rx="1.5" fill="#8C6B4F"/>`
    s += `<circle cx="${-cr * 0.55}" cy="${cy + cr * 0.25}" r="${cr * 0.75}" fill="#5FC27A"/><circle cx="${cr * 0.55}" cy="${cy + cr * 0.25}" r="${cr * 0.75}" fill="#5FC27A"/><circle cx="0" cy="${cy}" r="${cr}" fill="${col}"/>`
    if (stage === 4) {
      s += `<circle cx="${-cr * 0.3}" cy="${cy - cr * 0.2}" r="1.6" fill="#F6B221"/><circle cx="${cr * 0.35}" cy="${cy + cr * 0.1}" r="1.6" fill="#F6B221"/><circle cx="0" cy="${cy - cr * 0.55}" r="1.4" fill="#FFD36B"/>`
    }
    return s
  }

  if (species === 'fern') {
    s += `<path d="M0 6 Q2.5 ${6 - H * 0.5} 0 ${top}" stroke="${GREEN}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    const n = stage + 1
    for (let k = 1; k <= n; k++) {
      const y = 6 - H * k / (n + 1)
      const r = 2.6 + stage * 0.7
      s += leaf(-r - 1, y, -35, r + 1.5, 1.7, col) + leaf(r + 1, y, 35, r + 1.5, 1.7, col)
    }
    s += `<circle cx="0" cy="${top - 1}" r="${2 + stage * 0.3}" fill="${col}"/>`
    if (stage === 4) {
      s += `<circle cx="0" cy="${top - 1}" r="9" fill="${col}" opacity=".2"/>`
    }
    return s
  }

  s += stem + leaf(-4.5, 6 - H * 0.35, -30) + leaf(4.5, 6 - H * 0.5, 30)
  const fy = top
  const sc = [0, 0, 0.7, 1, 1.25][stage]
  if (stage === 4) {
    s += `<circle cx="0" cy="${fy}" r="15" fill="${col}" opacity=".2"/>`
  }
  if (stage === 2) {
    return s + `<circle cx="0" cy="${fy}" r="3.2" fill="${col}"/>`
  }

  s += `<g transform="translate(0 ${fy}) scale(${sc})">`
  if (species === 'daisy') {
    for (let k = 0; k < 8; k++) {
      const a = k * 45 * Math.PI / 180
      s += `<circle cx="${(6 * Math.cos(a)).toFixed(2)}" cy="${(6 * Math.sin(a)).toFixed(2)}" r="3.4" fill="${col}"/>`
    }
    s += `<circle r="3.6" fill="#E07A2F"/>`
  }
  else if (species === 'lotus') {
    for (const a of [-62, -31, 0, 31, 62]) {
      s += `<path d="M0 0 C-4 -4 -4 -10 0 -13 C4 -10 4 -4 0 0z" transform="rotate(${a})" fill="${col}" stroke="#FFFFFF33" stroke-width=".6"/>`
    }
    s += `<circle r="2.2" fill="#FFE9A8"/>`
  }
  else if (species === 'tulip') {
    s += `<path d="M-7 -6 C-7 3 -3 6 0 6 C3 6 7 3 7 -6 L3.5 -2 L0 -9 L-3.5 -2z" fill="${col}"/><path d="M0 -9 L0 5" stroke="#FFFFFF44" stroke-width=".8"/>`
  }
  else {
    for (let k = 0; k < 6; k++) {
      const a = (60 * k - 90) * Math.PI / 180
      s += `<polygon points="${hexPts(3.4, 6.4 * Math.cos(a), 6.4 * Math.sin(a))}" fill="${col}"/>`
    }
    s += `<polygon points="${hexPts(3.6)}" fill="#FFF1C2"/>`
  }
  return `${s}</g>`
}

const SPECIES_ORDER: PlantSpecies[] = ['daisy', 'fern', 'sprig', 'tulip', 'lotus', 'hexbloom']

/** Sample garden for the "Preview a mature garden" toggle: 19 plots covering every species and stage. */
export const PREVIEW_PLOT_COUNT = 19

export const PREVIEW_PLANTS: PlantData[] = Array.from({ length: PREVIEW_PLOT_COUNT }, (_, i) => ({
  species: SPECIES_ORDER[i % SPECIES_ORDER.length],
  stage: i % STAGE_NAMES.length,
}))
