<script setup lang="ts">
import type { PlantData } from '../lib/plants'
import { computed } from 'vue'
import { hexPoints, layoutGarden } from '../lib/hexLayout'
import { plantSvgMarkup, STAGE_NAMES } from '../lib/plants'

const props = defineProps<{
  plants: PlantData[]
  watered: boolean
  /** Briefly true right after watering, to trigger the grow bump. */
  pulse?: boolean
}>()

const layout = computed(() => layoutGarden(props.plants.length))

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
</script>

<template>
  <section class="garden" aria-label="Your garden">
    <div class="sky">
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <circle
          v-for="(s, i) in STARS" :key="i" class="star" :cx="s.x" :cy="s.y" :r="s.r" fill="#DCE4FF"
          :style="{ animationDelay: `${i * 0.5}s` }"
        />
        <path d="M296 28a22 22 0 1 0 14 38 18 18 0 0 1-14-38z" fill="#F4E9BF" opacity=".92" />
      </svg>
    </div>
    <div class="skylabel">
      <b>Dusk</b><span>Can't check validator conditions right now</span>
    </div>
    <svg
      :class="['plots', pulse ? 'pulse' : '', watered ? 'watered' : 'thirsty']"
      viewBox="0 0 360 290" preserveAspectRatio="xMidYMax meet" role="group"
      :aria-label="`Your garden, ${plants.length} plot${plants.length === 1 ? '' : 's'}`"
    >
      <g
        v-for="(pos, i) in layout.positions" :key="i" class="plot" role="img"
        :aria-label="`Plot ${i + 1}, ${STAGE_NAMES[plants[i].stage].toLowerCase()}`"
      >
        <polygon class="tile" :points="hexPoints(layout.radius * 0.94, pos.x, pos.y)" fill="#1B2347" stroke="#6F7DB877" stroke-width="1.6" />
        <g :transform="`translate(${pos.x.toFixed(1)} ${(pos.y + layout.radius * 0.26).toFixed(1)}) scale(${(layout.radius / 40 * 1.3).toFixed(3)})`">
          <g class="plant" v-html="plantSvgMarkup(plants[i].species, plants[i].stage)" />
        </g>
      </g>
    </svg>
  </section>
</template>

<style scoped>
/*
 * Sky is always Dusk: no validator reliability data exists yet either
 * (open question 9) — Dusk is the spec's honest "no data" state, never
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
  background: linear-gradient(180deg, #0a1033 0%, #18205a 65%, #262f70 100%);
  mask-image: linear-gradient(#000 12%, transparent 100%);
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
</style>
