<script setup lang="ts">
import type { PlantData } from '../lib/plants'
import type { SkyCondition } from '../lib/sky'
import { computed, ref, watch } from 'vue'
import { hexPoints, layoutGarden } from '../lib/hexLayout'
import { plantSvgMarkup, STAGE_NAMES } from '../lib/plants'

const props = withDefaults(defineProps<{
  plants: PlantData[]
  watered: boolean
  /** Briefly true right after watering, to trigger the grow bump. */
  pulse?: boolean
  skyCondition?: SkyCondition
  skyLabel?: string
  /** Faint, unowned outlines for the next tier, shown trailing the real plots. */
  lockedPlots?: number
  /** Caption for the locked plots, e.g. "100,000 more NIM unlocks 7 more plots". */
  unlockHint?: string
}>(), {
  pulse: false,
  skyCondition: 'dusk',
  skyLabel: 'Can\'t check your validator right now',
  lockedPlots: 0,
})

const layout = computed(() => layoutGarden(props.plants.length, props.lockedPlots))

const SKY_TITLES: Record<SkyCondition, string> = { sunny: 'Sunny', stormy: 'Stormy', dusk: 'Dusk' }
const skyTitle = computed(() => SKY_TITLES[props.skyCondition])

const TILE_COLORS: Record<SkyCondition, { fill: string, stroke: string }> = {
  sunny: { fill: '#1D3B38', stroke: '#F6B22199' },
  stormy: { fill: '#352F33', stroke: '#A38585AA' },
  dusk: { fill: '#1B2347', stroke: '#6F7DB877' },
}
const tileColor = computed(() => TILE_COLORS[props.skyCondition])

const STARS = [
  { x: 40, y: 30, r: 1.9 },
  { x: 90, y: 70, r: 1.4 },
  { x: 150, y: 24, r: 1.9 },
  { x: 210, y: 58, r: 1.4 },
  { x: 250, y: 22, r: 1.9 },
  { x: 330, y: 44, r: 1.4 },
  { x: 360, y: 84, r: 1.9 },
  { x: 60, y: 104, r: 1.4 },
]

const STORM_CLOUDS = [
  { x: 110, y: 48, s: 1.5, color: '#3B3858', cls: '' },
  { x: 260, y: 40, s: 1.7, color: '#4A4570', cls: 'b' },
  { x: 200, y: 62, s: 1.3, color: '#322F4F', cls: '' },
]

const RAIN_LINES = Array.from({ length: 16 }, (_, k) => ({
  x: 20 + k * 22 + (k % 3) * 5,
  delay: Number((k * 0.17).toFixed(2)),
}))

// Falling water drops on watering. transform/opacity only (the "fall"
// keyframe below), so the global prefers-reduced-motion override already
// disables this without any extra code here.
interface Drop { id: number, left: number, delay: number }
const drops = ref<Drop[]>([])
let nextDropId = 0

watch(() => props.pulse, (isPulsing) => {
  if (!isPulsing)
    return
  const spawned: Drop[] = Array.from({ length: 16 }, () => ({
    id: nextDropId++,
    left: 8 + Math.random() * 84,
    delay: Math.random() * 0.5,
  }))
  drops.value.push(...spawned)
  const spawnedIds = new Set(spawned.map(d => d.id))
  setTimeout(() => {
    drops.value = drops.value.filter(d => !spawnedIds.has(d.id))
  }, 1700)
})
</script>

<template>
  <section class="garden" aria-label="Your garden">
    <div :class="['sky', skyCondition]">
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <template v-if="skyCondition === 'sunny'">
          <g class="rays">
            <line
              v-for="k in 12" :key="k" x1="292" y1="14" x2="292" y2="24" stroke="#FFE08A"
              stroke-width="2.4" stroke-linecap="round" :transform="`rotate(${(k - 1) * 30} 292 52)`" opacity=".8"
            />
          </g>
          <circle cx="292" cy="52" r="34" fill="#FFD36B" opacity=".22" />
          <circle cx="292" cy="52" r="19" fill="#FFD36B" />
        </template>
        <template v-else-if="skyCondition === 'stormy'">
          <g v-for="(c, i) in STORM_CLOUDS" :key="i" :class="['cloud', c.cls]">
            <g :transform="`translate(${c.x} ${c.y}) scale(${c.s})`" :fill="c.color">
              <ellipse cx="0" cy="0" rx="30" ry="11" />
              <circle cx="-10" cy="-9" r="11" />
              <circle cx="9" cy="-13" r="14" />
            </g>
          </g>
          <line
            v-for="(r, i) in RAIN_LINES" :key="i" class="rainline" :x1="r.x" y1="52" :x2="r.x - 4" y2="64"
            stroke="#9FB5E8" stroke-width="1.6" stroke-linecap="round" :style="{ animationDelay: `${r.delay}s` }"
          />
        </template>
        <template v-else>
          <circle
            v-for="(s, i) in STARS" :key="i" class="star" :cx="s.x" :cy="s.y" :r="s.r" fill="#DCE4FF"
            :style="{ animationDelay: `${i * 0.5}s` }"
          />
          <path d="M296 28a22 22 0 1 0 14 38 18 18 0 0 1-14-38z" fill="#F4E9BF" opacity=".92" />
        </template>
      </svg>
    </div>
    <div class="skylabel">
      <b>{{ skyTitle }}</b><span>{{ skyLabel }}</span>
    </div>
    <svg
      :class="['plots', pulse ? 'pulse' : '', watered ? 'watered' : 'thirsty']"
      viewBox="0 0 360 290" preserveAspectRatio="xMidYMax meet" role="group"
      :aria-label="`Your garden, ${plants.length} plot${plants.length === 1 ? '' : 's'}`"
    >
      <g
        v-for="(pos, i) in layout.positions" :key="`real-${i}`" class="plot" role="img"
        :aria-label="`Plot ${i + 1}, ${STAGE_NAMES[plants[i].stage].toLowerCase()}`"
      >
        <polygon class="tile" :points="hexPoints(layout.radius * 0.94, pos.x, pos.y)" :fill="tileColor.fill" :stroke="tileColor.stroke" stroke-width="1.6" />
        <g :transform="`translate(${pos.x.toFixed(1)} ${(pos.y + layout.radius * 0.26).toFixed(1)}) scale(${(layout.radius / 40 * 1.3).toFixed(3)})`">
          <g class="plant" v-html="plantSvgMarkup(plants[i].species, plants[i].stage)" />
        </g>
      </g>
      <g
        v-for="(pos, i) in layout.lockedPositions" :key="`locked-${i}`" class="plot locked" role="img"
        :aria-label="`Locked plot ${i + 1}`"
      >
        <polygon
          class="tile locked-tile" :points="hexPoints(layout.radius * 0.94, pos.x, pos.y)"
          fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.4" stroke-dasharray="3 3"
        />
      </g>
    </svg>
    <p v-if="unlockHint" class="unlock-hint">
      {{ unlockHint }}
    </p>
    <span
      v-for="d in drops" :key="d.id" class="drop"
      :style="{ left: `${d.left}%`, animationDelay: `${d.delay}s` }"
    />
  </section>
</template>

<style scoped>
/*
 * Sky reflects the user's own delegation validator (see docs/SPEC.md,
 * "Deviation: sky from real validator data"), not a reliability score.
 * Dusk covers both "lookup failed" and "validator not found" — never
 * shown as Stormy just because data is missing.
 */
.garden {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: #0a1033;
}

.sky {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 160px;
  mask-image: linear-gradient(#000 12%, transparent 100%);
}

.sky.sunny {
  background: linear-gradient(180deg, #172e68 0%, #2c509a 60%, #6a7fa8 100%);
}

.sky.stormy {
  background: linear-gradient(180deg, #10132a 0%, #262345 65%, #3a3159 100%);
}

.sky.dusk {
  background: linear-gradient(180deg, #0a1033 0%, #18205a 65%, #262f70 100%);
}

.sky svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.star {
  animation: twinkle 4s ease-in-out infinite;
}

@keyframes twinkle {
  50% {
    opacity: .25;
  }
}

.rays {
  transform-origin: 292px 52px;
  animation: spin 70s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cloud {
  animation: drift 9s ease-in-out infinite alternate;
}

.cloud.b {
  animation-duration: 12s;
  animation-delay: -4s;
}

@keyframes drift {
  from {
    transform: translateX(-8px);
  }
  to {
    transform: translateX(8px);
  }
}

.rainline {
  animation: rain 1.3s linear infinite;
}

@keyframes rain {
  from {
    transform: translateY(-30px);
    opacity: 0;
  }
  25% {
    opacity: .7;
  }
  to {
    transform: translateY(150px);
    opacity: 0;
  }
}

.skylabel {
  position: absolute;
  left: 14px;
  top: 12px;
  z-index: 2;
  padding: 7px 14px 7px 12px;
  border-radius: 14px;
  background: rgba(11, 18, 48, .58);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, .18);
  color: var(--text);
  display: flex;
  flex-direction: column;
  text-align: left;
}

.skylabel b {
  font-size: 15px;
  line-height: 1.15;
}

.skylabel span {
  font-size: 12.5px;
  color: #d2d9f2;
  line-height: 1.2;
}

.plots {
  position: relative;
  display: block;
  width: 100%;
  height: 290px;
}

.unlock-hint {
  margin: 0;
  padding: 0 14px 14px;
  font-size: 12.5px;
  color: var(--mist);
  text-align: center;
}

.plant {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}

.thirsty .plant {
  filter: saturate(.4) brightness(.75);
}

.watered .plant {
  filter: drop-shadow(0 0 5px rgba(246, 178, 33, .5));
}

/* .seedglow is injected via v-html (plantSvgMarkup), so it never gets the scoped-CSS attribute; :deep() is required to reach it. */
.plant :deep(.seedglow) {
  animation: breathe 3s ease-in-out infinite;
}

@keyframes breathe {
  50% {
    opacity: .55;
  }
}

.pulse .plant {
  animation: grow .8s ease;
}

@keyframes grow {
  40% {
    transform: scale(1.14);
  }
  100% {
    transform: scale(1);
  }
}

.drop {
  position: absolute;
  top: -14px;
  width: 6px;
  height: 12px;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: #8fd3ff;
  opacity: .9;
  animation: fall .9s ease-in forwards;
  z-index: 4;
  pointer-events: none;
}

@keyframes fall {
  to {
    transform: translateY(310px);
    opacity: 0;
  }
}
</style>
