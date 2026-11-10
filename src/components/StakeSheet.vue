<script setup lang="ts">
import type { TxOutcome } from '../lib/txOutcome'
import type { NimiqProvider } from '../nimiq/provider'
import type { ValidatorDirectoryEntry } from '../nimiq/validatorsApi'
import { computed, onMounted, ref } from 'vue'
import { formatNim, nimToLuna } from '../lib/luna'
import { compactAddress, isValidatorHealthy } from '../lib/sky'
import { classifyStakeRecheck, classifyTxError, TX_OUTCOME_COPY } from '../lib/txOutcome'
import { getHostNetwork, getProvider, rpcUrlForNetwork } from '../nimiq/provider'
import { readCombinedStaker } from '../nimiq/staker'
import { fetchValidatorsDirectory, isRecommendedValidator } from '../nimiq/validatorsApi'

const props = defineProps<{
  addresses: string[]
  /** Best guess when the sheet opened — the actual create-vs-add call always re-checks the chain fresh, just before sending. */
  hasStaker: boolean
  existingDelegation: string | null
  spendableLuna: number
}>()

const emit = defineEmits<{
  close: []
  staked: []
}>()

type Phase = 'loading' | 'form' | 'sending' | 'confirming' | 'success' | 'sentPending' | 'outcome'

const phase = ref<Phase>('loading')
const loadError = ref(false)
const minimumLuna = ref<bigint | null>(null)

interface ValidatorOption {
  address: string
  numStakers: number
  healthy: boolean
  /** From the Validators API (src/nimiq/validatorsApi.ts) — null when it's unreachable or has no entry for this validator. Additive: the chooser works the same without it. */
  feeFraction: number | null
  scoreTotal: number | null
  dominanceRatio: number | null
  recommended: boolean
}

const validators = ref<ValidatorOption[]>([])
const selectedValidator = ref('')
/** The validator pickDefaultValidator() chose when the sheet opened — kept even after the user picks a different one, so the list can still mark which one was the default. */
const defaultValidatorAddress = ref('')
/** True when the Validators API returned nothing (failed, timed out, or just an empty list) — the chain-RPC fields still work, this only hides fee/reliability/size/Recommended. The reason is logged to the console by fetchValidatorsDirectory itself. */
const directoryUnavailable = ref(false)

const amountInput = ref('')
const amountError = ref('')

const outcome = ref<TxOutcome | null>(null)
const confirmedLuna = ref<bigint>(0n)
const baselineTotal = ref<bigint>(0n)
/**
 * "Timed out"'s cause is unconfirmed (see docs/SPEC.md) — never offer an
 * immediate retry for it. Only true once a chain check has shown nothing
 * changed; a transaction that's still genuinely pending surfaces on its
 * own, as "blocked", the moment a retry is actually attempted.
 */
const timedOutRetryAllowed = ref(false)
/** "A few seconds" for the automatic post-"timed out" chain check. */
const TIMED_OUT_AUTO_CHECK_DELAY_MS = 4000

function shortAddr(address: string): string {
  const parts = address.split(' ').filter(Boolean)
  if (parts.length <= 3)
    return address
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
}

function pluralStakers(n: number): string {
  return `${n} staker${n === 1 ? '' : 's'}`
}

/** 0.0523 → "5.2%". Used for fee, reliability and network-size figures, all fractions from the Validators API. */
function formatFraction(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.01 ? 1 : 0)}%`
}

/** The optional second line under a validator's Active/Not active status, when the Validators API has data for it. */
function validatorMetaLine(v: ValidatorOption): string {
  const parts: string[] = []
  if (v.feeFraction !== null)
    parts.push(`${formatFraction(v.feeFraction)} fee`)
  if (v.scoreTotal !== null)
    parts.push(`${formatFraction(v.scoreTotal)} reliability`)
  if (v.dominanceRatio !== null)
    parts.push(`${formatFraction(v.dominanceRatio)} of network`)
  return parts.join(' · ')
}

function parseValidators(raw: unknown): ValidatorOption[] {
  if (!Array.isArray(raw))
    return []
  const out: ValidatorOption[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof (entry as { address?: unknown }).address === 'string') {
      const v = entry as { address: string, numStakers?: unknown, retired?: boolean, inactivityFlag?: unknown, jailedFrom?: unknown }
      out.push({
        address: v.address,
        numStakers: typeof v.numStakers === 'number' ? v.numStakers : 0,
        healthy: isValidatorHealthy(v),
        feeFraction: null,
        scoreTotal: null,
        dominanceRatio: null,
        recommended: false,
      })
    }
  }
  return out
}

/**
 * Layers the Validators API's fee, reliability score and pool size onto the
 * chain-RPC validator list, by address. Purely additive: a validator with
 * no matching directory entry (the API failed, or just doesn't list it)
 * keeps its chain-only fields untouched, exactly as before this existed.
 */
function mergeDirectory(chainValidators: ValidatorOption[], directory: ValidatorDirectoryEntry[]): ValidatorOption[] {
  const byAddress = new Map(directory.map(d => [compactAddress(d.address), d]))
  return chainValidators.map((v) => {
    const entry = byAddress.get(compactAddress(v.address))
    if (!entry)
      return v
    return {
      ...v,
      feeFraction: entry.feeFraction,
      scoreTotal: entry.scoreTotal,
      dominanceRatio: entry.dominanceRatio,
      recommended: isRecommendedValidator(entry),
    }
  })
}

function pickDefaultValidator(list: ValidatorOption[]): string {
  const healthy = list.filter(v => v.healthy).sort((a, b) => b.numStakers - a.numStakers)
  if (healthy.length)
    return healthy[0].address
  return [...list].sort((a, b) => b.numStakers - a.numStakers)[0]?.address ?? ''
}

async function loadForm() {
  phase.value = 'loading'
  loadError.value = false
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))

    const policyPromise = nimiq
      .request<{ minimumStake?: number }>({ method: 'getPolicyConstants' })
      .catch((error: unknown) => {
        console.error('Could not load policy constants:', error)
        return null
      })

    if (props.hasStaker) {
      const policy = await policyPromise
      minimumLuna.value = typeof policy?.minimumStake === 'number' ? BigInt(policy.minimumStake) : null
      phase.value = 'form'
      return
    }

    const [policy, rawValidators, directory] = await Promise.all([
      policyPromise,
      nimiq.request<unknown>({ method: 'getActiveValidators' }),
      fetchValidatorsDirectory(getHostNetwork()),
    ])
    minimumLuna.value = typeof policy?.minimumStake === 'number' ? BigInt(policy.minimumStake) : null
    directoryUnavailable.value = directory.length === 0
    validators.value = mergeDirectory(parseValidators(rawValidators), directory)
    if (!validators.value.length) {
      loadError.value = true
      return
    }
    selectedValidator.value = pickDefaultValidator(validators.value)
    defaultValidatorAddress.value = selectedValidator.value
    phase.value = 'form'
  }
  catch (error) {
    console.error('Could not load the stake sheet:', error)
    loadError.value = true
  }
}

onMounted(loadForm)

const amountLuna = computed<bigint | null>(() => {
  try {
    return nimToLuna(amountInput.value)
  }
  catch {
    return null
  }
})

const canSubmit = computed(() => {
  if (phase.value !== 'form')
    return false
  const value = amountLuna.value
  if (value === null || value <= 0n)
    return false
  if (value > BigInt(Math.trunc(props.spendableLuna)))
    return false
  if (!props.hasStaker) {
    if (!selectedValidator.value)
      return false
    if (minimumLuna.value !== null && value < minimumLuna.value)
      return false
  }
  return true
})

/** Why the Stake/Add button is disabled, shown under it — so it's never disabled with no explanation. Empty once canSubmit is true. */
const disabledHint = computed(() => {
  if (phase.value !== 'form' || canSubmit.value)
    return ''
  const value = amountLuna.value
  if (!amountInput.value.trim() || value === null || value <= 0n) {
    return !props.hasStaker && minimumLuna.value !== null
      ? `Enter at least ${formatNim(minimumLuna.value)} NIM.`
      : 'Enter an amount.'
  }
  if (value > BigInt(Math.trunc(props.spendableLuna)))
    return 'That\'s more than your spendable balance.'
  if (!props.hasStaker && minimumLuna.value !== null && value < minimumLuna.value)
    return `Enter at least ${formatNim(minimumLuna.value)} NIM.`
  if (!props.hasStaker && !selectedValidator.value)
    return 'Choose a validator.'
  return ''
})

function validate(): boolean {
  amountError.value = ''
  const value = amountLuna.value
  if (!amountInput.value.trim()) {
    amountError.value = 'Enter an amount.'
    return false
  }
  if (value === null) {
    amountError.value = 'Enter a NIM amount with up to 5 decimal places.'
    return false
  }
  if (value <= 0n) {
    amountError.value = 'Enter an amount above 0.'
    return false
  }
  if (!props.hasStaker && minimumLuna.value !== null && value < minimumLuna.value) {
    amountError.value = `The minimum stake is ${formatNim(minimumLuna.value)} NIM.`
    return false
  }
  if (value > BigInt(Math.trunc(props.spendableLuna))) {
    amountError.value = 'That\'s more than your spendable balance.'
    return false
  }
  if (!props.hasStaker && !selectedValidator.value) {
    amountError.value = 'Choose a validator.'
    return false
  }
  return true
}

async function pollForConfirmation(nimiq: NimiqProvider) {
  const attempts = 12
  const delayMs = 4000
  for (let i = 0; i < attempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const after = await readCombinedStaker(nimiq, props.addresses)
      const total = after.earningLuna + after.waitingLuna + after.releasedLuna
      if (total > baselineTotal.value) {
        phase.value = 'success'
        emit('staked')
        return
      }
    }
    catch (error) {
      console.error('Could not check for confirmation:', error)
    }
  }
  phase.value = 'sentPending'
  emit('staked')
}

async function onSubmit() {
  if (!validate())
    return
  const value = amountLuna.value!
  timedOutRetryAllowed.value = false
  phase.value = 'sending'

  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))

    // Read the chain fresh right before sending, to decide create vs add —
    // never trust the hasStaker prop for the call itself, only for the form.
    const before = await readCombinedStaker(nimiq, props.addresses)
    const alreadyStaked = before.earningLuna > 0n || before.waitingLuna > 0n || before.releasedLuna > 0n
    baselineTotal.value = before.earningLuna + before.waitingLuna + before.releasedLuna

    if (alreadyStaked) {
      await nimiq.sendStakeTransaction({ value: Number(value) })
    }
    else {
      await nimiq.sendNewStakerTransaction({ delegation: selectedValidator.value, value: Number(value) })
    }

    confirmedLuna.value = value
    phase.value = 'confirming'
    await pollForConfirmation(nimiq)
  }
  catch (error) {
    console.error('Stake transaction failed:', error)
    outcome.value = classifyTxError(error)
    phase.value = 'outcome'
    if (outcome.value === 'timedOut')
      scheduleTimedOutAutoCheck()
  }
}

async function checkAgain() {
  phase.value = 'confirming'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const after = await readCombinedStaker(nimiq, props.addresses)
    const total = after.earningLuna + after.waitingLuna + after.releasedLuna
    if (total > baselineTotal.value) {
      phase.value = 'success'
      emit('staked')
      return
    }
  }
  catch (error) {
    console.error('Could not check for confirmation:', error)
  }
  outcome.value = 'maybeSent'
  phase.value = 'outcome'
}

/**
 * "Timed out" never offers an immediate retry (cause unconfirmed, see
 * docs/SPEC.md). Checks the chain first: confirmed if the stake now shows,
 * otherwise unlocks Try again rather than resubmitting automatically. If
 * the check itself fails, leaves only the manual Check again button.
 */
async function checkTimedOut() {
  phase.value = 'confirming'
  let result: ReturnType<typeof classifyStakeRecheck> = 'checkFailed'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const after = await readCombinedStaker(nimiq, props.addresses)
    const total = after.earningLuna + after.waitingLuna + after.releasedLuna
    result = classifyStakeRecheck({ ok: true, total }, baselineTotal.value)
  }
  catch (error) {
    console.error('Could not check for confirmation:', error)
  }

  if (result === 'confirmed') {
    phase.value = 'success'
    emit('staked')
    return
  }
  timedOutRetryAllowed.value = result === 'unchanged'
  outcome.value = 'timedOut'
  phase.value = 'outcome'
}

/**
 * Fires once, a few seconds after a fresh "timed out" outcome appears, so
 * the chain gets checked without making the user ask. Skipped if the user
 * has already moved on (closed, retried, or manually checked) by the time
 * it fires.
 */
function scheduleTimedOutAutoCheck() {
  setTimeout(() => {
    if (phase.value === 'outcome' && outcome.value === 'timedOut' && !timedOutRetryAllowed.value)
      checkTimedOut()
  }, TIMED_OUT_AUTO_CHECK_DELAY_MS)
}

function tryAgain() {
  outcome.value = null
  timedOutRetryAllowed.value = false
  phase.value = 'form'
}

function close() {
  emit('close')
}

const locked = computed(() => phase.value === 'sending' || phase.value === 'confirming')
</script>

<template>
  <div class="scrim" @click.self="!locked && close()">
    <div class="sheet" role="dialog" :aria-label="hasStaker ? 'Add stake' : 'Stake'" aria-modal="true">
      <button v-if="!locked" class="closebtn" type="button" aria-label="Close" @click="close">
        ×
      </button>

      <h2>{{ hasStaker ? 'Add stake' : 'Stake' }}</h2>

      <p v-if="phase === 'loading'" class="status" aria-live="polite">
        Loading…
      </p>

      <template v-else-if="loadError">
        <p class="hint" role="alert">
          Can't load this right now.
        </p>
        <button class="btn-primary" type="button" @click="loadForm">
          Try again
        </button>
      </template>

      <template v-else-if="phase === 'form'">
        <p class="hint">
          Spendable: {{ formatNim(spendableLuna) }} NIM
        </p>
        <p v-if="minimumLuna !== null && !hasStaker" class="hint">
          Minimum stake: {{ formatNim(minimumLuna) }} NIM
        </p>

        <label class="field">Amount (NIM)
          <input v-model="amountInput" type="text" inputmode="decimal" :aria-invalid="!!amountError">
        </label>
        <p v-if="amountError" class="hint" role="alert">
          {{ amountError }}
        </p>

        <p v-if="hasStaker" class="hint">
          Keeps earning with your current validator{{ existingDelegation ? `, ${shortAddr(existingDelegation)}` : '' }}.
        </p>
        <template v-else>
          <h3>Validator</h3>
          <ul class="validator-list" role="radiogroup" aria-label="Choose a validator">
            <li v-for="v in validators" :key="v.address">
              <button
                class="validator-row" type="button" role="radio" :aria-checked="selectedValidator === v.address"
                :class="{ selected: selectedValidator === v.address }" @click="selectedValidator = v.address"
              >
                <span class="vradio" aria-hidden="true" />
                <span class="vmain">
                  <span class="vaddr-row">
                    <span class="vaddr">{{ shortAddr(v.address) }}</span>
                    <span v-if="v.address === defaultValidatorAddress" class="vtag">Default</span>
                    <span v-if="v.recommended" class="vtag vtag-recommended">Recommended</span>
                  </span>
                  <span class="vstatus" :class="{ unhealthy: !v.healthy }">{{ v.healthy ? 'Active' : 'Not active' }} · {{ pluralStakers(v.numStakers) }}</span>
                  <span v-if="validatorMetaLine(v)" class="vmeta">{{ validatorMetaLine(v) }}</span>
                </span>
              </button>
            </li>
          </ul>
          <p v-if="directoryUnavailable" class="hint">
            Fee and reliability aren't available right now.
          </p>
        </template>

        <p class="hint">
          Yield is an estimate, and never guaranteed.
        </p>

        <button class="btn-primary" type="button" :disabled="!canSubmit" @click="onSubmit">
          {{ hasStaker ? `Add ${amountInput || '0'} NIM` : `Stake ${amountInput || '0'} NIM` }}
        </button>
        <p v-if="disabledHint" class="hint">
          {{ disabledHint }}
        </p>
      </template>

      <template v-else-if="phase === 'sending'">
        <p class="status" aria-live="polite">
          Approve in Nimiq Pay
        </p>
        <p class="hint">
          Waiting for your approval. Keep the app open.
        </p>
      </template>

      <template v-else-if="phase === 'confirming'">
        <p class="status" aria-live="polite">
          Checking the chain…
        </p>
      </template>

      <template v-else-if="phase === 'outcome' && outcome">
        <h3>{{ TX_OUTCOME_COPY[outcome].title }}</h3>
        <p>{{ outcome === 'timedOut' && timedOutRetryAllowed ? 'Nothing changed. You can try again.' : TX_OUTCOME_COPY[outcome].message }}</p>
        <button v-if="outcome === 'declined'" class="btn-primary" type="button" @click="close">
          Back
        </button>
        <template v-else-if="outcome === 'maybeSent'">
          <button class="btn-primary" type="button" @click="checkAgain">
            Check again
          </button>
          <button class="btn-ghost" type="button" @click="close">
            Back to garden
          </button>
        </template>
        <template v-else-if="outcome === 'timedOut'">
          <button v-if="timedOutRetryAllowed" class="btn-primary" type="button" @click="tryAgain">
            Try again
          </button>
          <button v-else class="btn-primary" type="button" @click="checkTimedOut">
            Check again
          </button>
          <button class="btn-ghost" type="button" @click="close">
            Back to garden
          </button>
        </template>
        <button v-else class="btn-primary" type="button" @click="tryAgain">
          Try again
        </button>
      </template>

      <template v-else-if="phase === 'success'">
        <h3>Done</h3>
        <p>{{ formatNim(confirmedLuna) }} NIM is now earning.</p>
        <button class="btn-primary" type="button" @click="close">
          Close
        </button>
      </template>

      <template v-else-if="phase === 'sentPending'">
        <h3>Sent</h3>
        <p>Your stake was sent. It can take a few minutes to show here.</p>
        <button class="btn-primary" type="button" @click="close">
          Close
        </button>
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

.sheet h3 {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--mist);
  font-weight: 700;
}

.sheet p {
  margin: 0;
  line-height: 1.5;
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

.status {
  color: var(--mist);
}

.hint {
  color: var(--mist);
  font-size: 14px;
}

.field {
  display: block;
  font-size: 13px;
  color: var(--mist);
}

.field input {
  display: block;
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--edge);
  background: var(--night);
  color: var(--text);
  font-size: 16px;
}

.field input[aria-invalid='true'] {
  border-color: #ff6b9d;
}

.validator-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.validator-row {
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.validator-row.selected {
  border-color: var(--gold);
}

.vradio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: 50%;
  border: 1.5px solid var(--edge);
  box-sizing: border-box;
}

.validator-row.selected .vradio {
  border-color: var(--gold);
  border-width: 5px;
}

.vmain {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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

.vtag-recommended {
  border-color: var(--gold);
  color: var(--gold-soft);
}

.vstatus {
  font-size: 12.5px;
  color: var(--mist);
}

.vstatus.unhealthy {
  color: #ff9dc0;
}

.vmeta {
  font-size: 12.5px;
  color: var(--mist);
}

.btn-primary {
  min-height: 56px;
  border-radius: 999px;
  border: 0;
  background: var(--gold);
  color: #1a1405;
  font-weight: 800;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-primary:disabled {
  background: var(--line);
  color: var(--mist);
  cursor: not-allowed;
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
</style>
