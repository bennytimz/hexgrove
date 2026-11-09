import { describe, expect, it } from 'vitest'
import { PREVIEW_PLANTS, PREVIEW_PLOT_COUNT, plantSvgMarkup, SPECIES, STAGE_NAMES } from './plants'

const ALL_SPECIES = Object.keys(SPECIES) as Array<keyof typeof SPECIES>

describe('plantSvgMarkup', () => {
  it('returns non-empty SVG markup for every species and stage', () => {
    for (const species of ALL_SPECIES) {
      for (let stage = 0; stage < STAGE_NAMES.length; stage++) {
        const markup = plantSvgMarkup(species, stage)
        expect(markup.length).toBeGreaterThan(0)
        expect(markup).toMatch(/<(ellipse|circle|path|polygon|rect|g)/)
      }
    }
  })

  it('stage 0 looks the same regardless of species (species is irrelevant until Sprout)', () => {
    const markups = ALL_SPECIES.map(species => plantSvgMarkup(species, 0))
    expect(new Set(markups).size).toBe(1)
  })

  it('uses each species\' own color somewhere in its grown markup', () => {
    for (const species of ALL_SPECIES) {
      const markup = plantSvgMarkup(species, 4)
      expect(markup).toContain(SPECIES[species].color)
    }
  })
})

describe('PREVIEW_PLANTS', () => {
  it('has exactly PREVIEW_PLOT_COUNT entries', () => {
    expect(PREVIEW_PLANTS).toHaveLength(PREVIEW_PLOT_COUNT)
  })

  it('covers every species and every stage at least once', () => {
    const speciesSeen = new Set(PREVIEW_PLANTS.map(p => p.species))
    const stagesSeen = new Set(PREVIEW_PLANTS.map(p => p.stage))
    expect(speciesSeen.size).toBe(ALL_SPECIES.length)
    expect(stagesSeen.size).toBe(STAGE_NAMES.length)
  })
})
