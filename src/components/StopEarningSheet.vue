<script setup lang="ts">
import type { TxOutcome } from '../lib/txOutcome'
import type { NimiqProvider } from '../nimiq/provider'
import { computed, onMounted, ref } from 'vue'
import { formatNim, lunaToNim, nimToLuna } from '../lib/luna'
import { classifyTxError, TX_OUTCOME_COPY } from '../lib/txOutcome'
import { aboutDuration } from '../lib/waiting'
import { getHostNetwork, getProvider, rpcUrlForNetwork } from '../nimiq/provider'
import { readPolicyConstants } from '../nimiq/policy'
import { readCombinedStaker } from '../nimiq/staker'

const props = defineProps<{
  addresses: string[]
  earningLuna: bigint
}>()

const emit = defineEmits<{
  close: []
  stopped: []
}>()

type Phase = 'loading' | 'form' | 'sending' | 'confirming' | 'success' | 'sentPending' | 'outcome'

const phase = ref<Phase>('loading')
const loadError = ref(false)
const minimumLuna = ref<bigint | null>(null)
const blocksPerEpoch = ref<number | null>(null)

const amountInput = ref('')
const amountError = ref('')

const outcome = ref<TxOutcome | null>(null)
const stoppedLuna = ref<bigint>(0n)
const baselineEarningLuna = ref<bigint>(0n)
/**
 * "Timed out"'s cause is unconfirmed (see docs/SPEC.md) — never offer an
 * immediate retry for it. Only true once a chain check has shown nothing
 * changed; a transaction that's still genuinely pending surfaces on its
 * own, as "blocked", the moment a retry is actually attempted.
 */
const timedOutRetryAllowed = ref(false)
/** "A few seconds" for the automatic post-"timed out" chain check. */
const TIMED_OUT_AUTO_CHECK_DELAY_MS = 4000

async function loadForm() {
  phase.value = 'loading'
  loadError.value = false
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const policy = await readPolicyConstants(nimiq)
    minimumLuna.value = policy.minimumStakeLuna
    blocksPerEpoch.value = policy.blocksPerEpoch
    phase.value = 'form'
  }
  catch (error) {
    console.error('Could not load the stop-earning sheet:', error)
    loadError.value = true
  }
}

onMounted(loadForm)

function setQuickAmount(percent: number) {
  amountInput.value = lunaToNim((props.earningLuna * BigInt(percent)) / 100n)
}

const amountLuna = computed<bigint | null>(() => {
  try {
    return nimToLuna(amountInput.value)
  }
  catch {
    return null
  }
})

/**
 * Conservative by design (docs/SPEC.md, "Unstaking timing" — DOCUMENTED,
 * NOT YET VERIFIED ON CHAIN): sendSetActiveStakeTransaction takes an
 * absolute target, and a target between 0 and the minimum stake risks a
 * chain rejection that can block the wallet from sending anything else
 * for up to 2 hours. Only 0 or at least the minimum is ever offered.
 */
const canSubmit = computed(() => {
  if (phase.value !== 'form')
    return false
  const amount = amountLuna.value
  if (amount === null || amount <= 0n || amount > props.earningLuna)
    return false
  const remaining = props.earningLuna - amount
  if (remaining === 0n)
    return true
  return minimumLuna.value !== null && remaining >= minimumLuna.value
})

/** Why the Stop button is disabled, shown under it — so it's never disabled with no explanation. Empty once canSubmit is true. */
const disabledHint = computed(() => {
  if (phase.value !== 'form' || canSubmit.value)
    return ''
  const amount = amountLuna.value
  if (!amountInput.value.trim() || amount === null || amount <= 0n)
    return 'Enter an amount to stop.'
  if (amount > props.earningLuna)
    return 'That\'s more than what\'s earning.'
  const remaining = props.earningLuna - amount
  if (minimumLuna.value === null)
    return 'Can\'t confirm the minimum stake right now. Stop everything (100%), or try again shortly.'
  if (remaining < minimumLuna.value)
    return `Leave 0 or at least ${formatNim(minimumLuna.value)} NIM earning. In-between amounts are blocked, since the chain can reject them.`
  return ''
})

function validate(): boolean {
  amountError.value = ''
  const amount = amountLuna.value
  if (!amountInput.value.trim()) {
    amountError.value = 'Enter an amount.'
    return false
  }
  if (amount === null) {
    amountError.value = 'Enter a NIM amount with up to 5 decimal places.'
    return false
  }
  if (amount <= 0n) {
    amountError.value = 'Enter an amount above 0.'
    return false
  }
  if (amount > props.earningLuna) {
    amountError.value = 'That\'s more than what\'s earning.'
    return false
  }
  const remaining = props.earningLuna - amount
  if (remaining > 0n) {
    if (minimumLuna.value === null) {
      amountError.value = 'Can\'t confirm the minimum stake right now. Stop everything (100%), or try again shortly.'
      return false
    }
    if (remaining < minimumLuna.value) {
      amountError.value = `Leave 0 or at least ${formatNim(minimumLuna.value)} NIM earning.`
      return false
    }
  }
  return true
}

/** "This can take about 12 to 24 hours" — derived live from blocksPerEpoch, never hardcoded (docs/SPEC.md, "Unstaking timing"). */
const waitExplanation = computed(() => {
  if (blocksPerEpoch.value === null)
    return 'This can take about 12 to 24 hours, depending on timing. Unverified — see docs/SPEC.md.'
  return `This can take about ${aboutDuration(blocksPerEpoch.value)} to ${aboutDuration(blocksPerEpoch.value * 2)}, depending on timing. Unverified — see docs/SPEC.md.`
})

async function pollForConfirmation(nimiq: NimiqProvider) {
  const attempts = 12
  const delayMs = 4000
  for (let i = 0; i < attempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const after = await readCombinedStaker(nimiq, props.addresses)
      if (after.earningLuna < baselineEarningLuna.value) {
        phase.value = 'success'
        emit('stopped')
        return
      }
    }
    catch (error) {
      console.error('Could not check for confirmation:', error)
    }
  }
  phase.value = 'sentPending'
  emit('stopped')
}

async function onSubmit() {
  if (!validate())
    return
  const amount = amountLuna.value!
  timedOutRetryAllowed.value = false
  phase.value = 'sending'

  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))

    // Read the chain fresh right before sending — never trust the prop for
    // the actual target, which is an absolute balance, not a delta.
    const before = await readCombinedStaker(nimiq, props.addresses)
    baselineEarningLuna.value = before.earningLuna
    const newActiveBalance = before.earningLuna > amount ? before.earningLuna - amount : 0n

    await nimiq.sendSetActiveStakeTransaction({ newActiveBalance: Number(newActiveBalance) })

    stoppedLuna.value = amount
    phase.value = 'confirming'
    await pollForConfirmation(nimiq)
  }
  catch (error) {
    console.error('Stop-earning transaction failed:', error)
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
    if (after.earningLuna < baselineEarningLuna.value) {
      phase.value = 'success'
      emit('stopped')
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
 * docs/SPEC.md). Checks the chain first: confirmed if earning dropped,
 * otherwise unlocks Try again rather than resubmitting automatically. If
 * the check itself fails, leaves only the manual Check again button.
 */
async function checkTimedOut() {
  phase.value = 'confirming'
  let confirmed = false
  let checkFailed = true
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const after = await readCombinedStaker(nimiq, props.addresses)
    checkFailed = false
    confirmed = after.earningLuna < baselineEarningLuna.value
  }
  catch (error) {
    console.error('Could not check for confirmation:', error)
  }

  if (confirmed) {
    phase.value = 'success'
    emit('stopped')
    return
  }
  timedOutRetryAllowed.value = !checkFailed
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
    <div class="sheet" role="dialog" aria-label="Stop earning" aria-modal="true">
      <button v-if="!locked" class="closebtn" type="button" aria-label="Close" @click="close">
        ×
      </button>

      <h2>Stop earning</h2>

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
          Earning: {{ formatNim(earningLuna) }} NIM
        </p>

        <div class="quick-amounts">
          <button v-for="pct in [25, 50, 75, 100]" :key="pct" type="button" class="btn-ghost quick" @click="setQuickAmount(pct)">
            {{ pct }}%
          </button>
        </div>

        <label class="field">Amount to stop (NIM)
          <input v-model="amountInput" type="text" inputmode="decimal" :aria-invalid="!!amountError">
        </label>
        <p v-if="amountError" class="hint" role="alert">
          {{ amountError }}
        </p>

        <p class="hint">{{ waitExplanation }}</p>
        <p class="hint">Plots beyond what's still earning go dormant, not deleted.</p>

        <button class="btn-primary" type="button" :disabled="!canSubmit" @click="onSubmit">
          Stop {{ amountInput || '0' }} NIM
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
        <p>{{ formatNim(stoppedLuna) }} NIM has stopped earning. {{ waitExplanation }}</p>
        <button class="btn-primary" type="button" @click="close">
          Close
        </button>
      </template>

      <template v-else-if="phase === 'sentPending'">
        <h3>Sent</h3>
        <p>Your request was sent. It can take a few minutes to show here.</p>
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

.quick-amounts {
  display: flex;
  gap: 8px;
}

.quick {
  flex: 1;
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
