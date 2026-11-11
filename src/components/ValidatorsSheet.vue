<script setup lang="ts">
import type { ValidatorOption } from '../nimiq/validatorsApi'
import { computed, onMounted, ref } from 'vue'
import { describeValidatorStatus, isCurrentValidator, validatorFacts } from '../lib/validatorRow'
import { networkRate } from '../lib/yield'
import { getHostNetwork, getProvider, rpcUrlForNetwork } from '../nimiq/provider'
import { fetchValidatorsDirectory, mergeDirectory, parseValidators, sortValidatorOptions } from '../nimiq/validatorsApi'

/**
 * Read-only list of validators for someone who already has a stake. Reads
 * the same public data as the stake sheet's chooser (getActiveValidators
 * plus the Validators API) and sends nothing. There is deliberately no
 * switch action: see docs/SPEC.md open question 6.
 */
const props = defineProps<{
  delegation: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const phase = ref<'loading' | 'list' | 'error'>('loading')
const validators = ref<ValidatorOption[]>([])
const directoryUnavailable = ref(false)
const networkRateValue = ref<number | null>(null)

const currentValidator = computed(() => validators.value.find(v => isCurrentValidator(v.address, props.delegation)) ?? null)

function shortAddr(address: string): string {
  const parts = address.split(' ').filter(Boolean)
  if (parts.length <= 3)
    return address
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
}

async function load() {
  phase.value = 'loading'
  try {
    const nimiq = await getProvider()
    const network = getHostNetwork()
    nimiq.setRPCUrl(rpcUrlForNetwork(network))
    const [raw, directory] = await Promise.all([
      nimiq.request<unknown>({ method: 'getActiveValidators' }),
      fetchValidatorsDirectory(network),
    ])
    const merged = mergeDirectory(parseValidators(raw), directory)
    if (!merged.length) {
      phase.value = 'error'
      return
    }
    directoryUnavailable.value = directory.length === 0
    validators.value = sortValidatorOptions(merged)
    const activeStakeLuna = merged.reduce((sum, v) => (v.healthy && v.balanceLuna !== null) ? sum + v.balanceLuna : sum, 0)
    networkRateValue.value = networkRate(Date.now(), activeStakeLuna)
    phase.value = 'list'
  }
  catch (error) {
    console.error('Could not load the validator list:', error)
    phase.value = 'error'
  }
}

onMounted(load)
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-label="Validators" aria-modal="true">
      <button class="closebtn" type="button" aria-label="Close" @click="emit('close')">
        ×
      </button>
      <h2>Validators</h2>
      <p class="hint">
        Your stake stays with your current validator.
      </p>

      <p v-if="phase === 'loading'" class="status" aria-live="polite">
        Loading validators…
      </p>

      <template v-else-if="phase === 'error'">
        <p class="hint" role="alert">
          Can't load the validator list right now.
        </p>
        <button class="btn-ghost" type="button" @click="load">
          Try again
        </button>
      </template>

      <template v-else>
        <p v-if="delegation && !currentValidator" class="hint">
          Can't check your validator right now.
        </p>
        <ul class="validator-list" aria-label="Validators">
          <li
            v-for="v in validators" :key="v.address" class="validator-row"
            :class="{ current: isCurrentValidator(v.address, delegation) }"
          >
            <span class="vaddr-row">
              <span class="vaddr">{{ shortAddr(v.address) }}</span>
              <span v-if="isCurrentValidator(v.address, delegation)" class="vtag vtag-current">Your validator</span>
              <span v-if="v.recommended" class="vtag vtag-recommended">Recommended</span>
            </span>
            <span class="vstatus">
              <span
                v-if="describeValidatorStatus(v).condition" class="dot"
                :class="describeValidatorStatus(v).condition!" aria-hidden="true"
              />
              {{ describeValidatorStatus(v).text }}
            </span>
            <span v-if="validatorFacts(v, networkRateValue).length" class="vmeta">
              {{ validatorFacts(v, networkRateValue).join(' · ') }}
            </span>
          </li>
        </ul>
        <p v-if="directoryUnavailable" class="hint">
          Fee and reliability aren't available right now.
        </p>
        <p class="hint">
          Yield is an estimate, and never guaranteed.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(3, 6, 20, .62);
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  position: relative;
  width: 100%;
  max-width: 430px;
  max-height: 88dvh;
  overflow: auto;
  background: var(--deep);
  color: var(--text);
  border-radius: 22px 22px 0 0;
  padding: 20px 20px 28px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet h2 {
  margin: 0 0 4px;
  font-size: 21px;
  padding-right: 36px;
}

.closebtn {
  position: absolute;
  right: 8px;
  top: 12px;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--mist);
  font-size: 24px;
  cursor: pointer;
  border-radius: 50%;
}

.status,
.hint {
  color: var(--mist);
  font-size: 14px;
  margin: 0;
  line-height: 1.5;
}

.btn-ghost {
  min-height: 44px;
  border-radius: 999px;
  border: 1.5px solid var(--edge);
  background: transparent;
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.validator-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.validator-row {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.validator-row.current {
  border-color: var(--gold);
}

.vaddr-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.vaddr {
  font-weight: 700;
  font-size: 14px;
}

.vtag {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--edge);
  color: var(--mist);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .02em;
}

.vtag-recommended,
.vtag-current {
  border-color: var(--gold);
  color: var(--gold-soft);
}

.vstatus {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--mist);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot.sunny {
  background: var(--gold);
}

.dot.cloudy {
  background: var(--mist);
}

.dot.stormy {
  background: #ff9dc0;
}

.vmeta {
  font-size: 12.5px;
  color: var(--mist);
}
</style>
