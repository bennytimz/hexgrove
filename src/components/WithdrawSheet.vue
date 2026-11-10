<script setup lang="ts">
import type { TxOutcome } from '../lib/txOutcome'
import type { NimiqProvider } from '../nimiq/provider'
import { computed, onMounted, ref } from 'vue'
import { formatNim } from '../lib/luna'
import { ALMOST_DONE_COPY, classifyTxError, TX_OUTCOME_COPY } from '../lib/txOutcome'
import { getHostNetwork, getProvider, rpcUrlForNetwork } from '../nimiq/provider'
import { readCombinedStaker } from '../nimiq/staker'

/**
 * Confirmed on testnet, 2026-11-10 (docs/SPEC.md, "Unstaking timing") — a
 * real retire then remove, both approved in Nimiq Pay. Two sequential
 * approvals, never both at once: sendRetireStakeTransaction (release) with
 * the entire inactive balance, then sendRemoveStakeTransaction (withdraw)
 * with the entire retired balance. Both read fresh from the chain on open
 * and before each send, never from a prop — so reopening this sheet always
 * resumes from wherever the staker record actually is, including a stuck
 * step 2.
 */

const props = defineProps<{
  addresses: string[]
}>()

const emit = defineEmits<{
  close: []
  withdrawn: []
}>()

type Phase = 'loading' | 'confirm' | 'sending' | 'confirmingChain' | 'success' | 'sentPending' | 'outcome'

const phase = ref<Phase>('loading')
const loadError = ref(false)
const nothingToWithdraw = ref(false)

const step = ref<1 | 2>(1)
const retireAmountLuna = ref<bigint>(0n)
const removeAmountLuna = ref<bigint>(0n)
/** True once step 1 has succeeded (this session or resumed on open) — step 2 failing from here on is "Almost done", not a fresh failure. */
const almostDone = ref(false)

const outcome = ref<TxOutcome | null>(null)
/** "Timed out"'s cause is unconfirmed (see docs/SPEC.md) — never an immediate retry; only true once a chain check shows nothing changed. */
const timedOutRetryAllowed = ref(false)
/** "A few seconds" for the automatic post-"timed out" chain check. */
const TIMED_OUT_AUTO_CHECK_DELAY_MS = 4000

async function loadState() {
  phase.value = 'loading'
  loadError.value = false
  nothingToWithdraw.value = false
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const staker = await readCombinedStaker(nimiq, props.addresses)

    if (staker.releasedLuna > 0n) {
      step.value = 2
      almostDone.value = true
      removeAmountLuna.value = staker.releasedLuna
      phase.value = 'confirm'
      return
    }
    if (staker.waitingLuna > 0n) {
      step.value = 1
      almostDone.value = false
      retireAmountLuna.value = staker.waitingLuna
      phase.value = 'confirm'
      return
    }
    nothingToWithdraw.value = true
    phase.value = 'confirm'
  }
  catch (error) {
    console.error('Could not load the withdraw sheet:', error)
    loadError.value = true
  }
}

onMounted(loadState)

const title = computed(() => almostDone.value ? 'Finish withdrawing' : 'Withdraw')

const sentPendingMessage = computed(() => almostDone.value
  ? 'Your withdrawal was sent. It can take a few minutes to show here.'
  : 'Your release was sent. It can take a few minutes to show here. Reopen Withdraw once it does, to finish.')

async function sendStep2(nimiq: NimiqProvider) {
  phase.value = 'sending'
  try {
    await nimiq.sendRemoveStakeTransaction({ value: Number(removeAmountLuna.value) })
    phase.value = 'confirmingChain'
    await pollStep2Confirmation(nimiq)
  }
  catch (error) {
    console.error('Withdraw step 2 failed:', error)
    outcome.value = classifyTxError(error)
    almostDone.value = true
    phase.value = 'outcome'
    if (outcome.value === 'timedOut')
      scheduleTimedOutAutoCheck()
  }
}

async function pollStep1Confirmation(nimiq: NimiqProvider) {
  const attempts = 12
  const delayMs = 4000
  for (let i = 0; i < attempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const after = await readCombinedStaker(nimiq, props.addresses)
      if (after.releasedLuna > 0n) {
        step.value = 2
        almostDone.value = true
        removeAmountLuna.value = after.releasedLuna
        await sendStep2(nimiq)
        return
      }
    }
    catch (error) {
      console.error('Could not check for confirmation:', error)
    }
  }
  // Step 1 was sent but hasn't shown on chain within our polling window —
  // not an error, the call itself succeeded. Reopening Withdraw later
  // resumes at whichever step the chain then shows.
  phase.value = 'sentPending'
  emit('withdrawn')
}

async function pollStep2Confirmation(nimiq: NimiqProvider) {
  const attempts = 12
  const delayMs = 4000
  for (let i = 0; i < attempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const after = await readCombinedStaker(nimiq, props.addresses)
      if (after.releasedLuna === 0n) {
        phase.value = 'success'
        emit('withdrawn')
        return
      }
    }
    catch (error) {
      console.error('Could not check for confirmation:', error)
    }
  }
  phase.value = 'sentPending'
  emit('withdrawn')
}

async function onConfirm() {
  timedOutRetryAllowed.value = false
  phase.value = 'sending'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))

    if (step.value === 1) {
      await nimiq.sendRetireStakeTransaction({ retireStake: Number(retireAmountLuna.value) })
      phase.value = 'confirmingChain'
      await pollStep1Confirmation(nimiq)
    }
    else {
      await sendStep2(nimiq)
    }
  }
  catch (error) {
    console.error(`Withdraw step ${step.value} failed:`, error)
    outcome.value = classifyTxError(error)
    almostDone.value = step.value === 2
    phase.value = 'outcome'
    if (outcome.value === 'timedOut')
      scheduleTimedOutAutoCheck()
  }
}

async function checkAgain() {
  phase.value = 'confirmingChain'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const after = await readCombinedStaker(nimiq, props.addresses)
    if (almostDone.value) {
      if (after.releasedLuna === 0n) {
        phase.value = 'success'
        emit('withdrawn')
        return
      }
    }
    else if (after.releasedLuna > 0n) {
      step.value = 2
      almostDone.value = true
      removeAmountLuna.value = after.releasedLuna
      await sendStep2(nimiq)
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
 * docs/SPEC.md). Checks the chain first: if step 1 turns out to have
 * landed, moves straight into step 2; if the still-relevant step is
 * confirmed done, success; otherwise unlocks Try again. If the check
 * itself fails, leaves only the manual Check again button.
 */
async function checkTimedOut() {
  phase.value = 'confirmingChain'
  let checkFailed = true
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(getHostNetwork()))
    const after = await readCombinedStaker(nimiq, props.addresses)
    checkFailed = false
    if (almostDone.value) {
      if (after.releasedLuna === 0n) {
        phase.value = 'success'
        emit('withdrawn')
        return
      }
    }
    else if (after.releasedLuna > 0n) {
      step.value = 2
      almostDone.value = true
      removeAmountLuna.value = after.releasedLuna
      await sendStep2(nimiq)
      return
    }
  }
  catch (error) {
    console.error('Could not check for confirmation:', error)
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
  phase.value = 'confirm'
}

function close() {
  emit('close')
}

const locked = computed(() => phase.value === 'sending' || phase.value === 'confirmingChain')
</script>

<template>
  <div class="scrim" @click.self="!locked && close()">
    <div class="sheet" role="dialog" :aria-label="title" aria-modal="true">
      <button v-if="!locked" class="closebtn" type="button" aria-label="Close" @click="close">
        ×
      </button>

      <h2>{{ title }}</h2>

      <p v-if="phase === 'loading'" class="status" aria-live="polite">
        Loading…
      </p>

      <template v-else-if="loadError">
        <p class="hint" role="alert">
          Can't load this right now.
        </p>
        <button class="btn-primary" type="button" @click="loadState">
          Try again
        </button>
      </template>

      <template v-else-if="nothingToWithdraw">
        <p class="hint">
          Nothing is ready to withdraw right now.
        </p>
        <button class="btn-primary" type="button" @click="close">
          Close
        </button>
      </template>

      <template v-else-if="phase === 'confirm'">
        <template v-if="step === 1">
          <p class="hint">
            {{ formatNim(retireAmountLuna) }} NIM is ready.
          </p>
          <p class="hint">
            This takes two approvals in Nimiq Pay, one at a time: release, then withdraw.
          </p>
          <button class="btn-primary" type="button" @click="onConfirm">
            Release (step 1 of 2)
          </button>
        </template>
        <template v-else>
          <p class="hint">
            {{ formatNim(removeAmountLuna) }} NIM is released and waiting for the last step.
          </p>
          <button class="btn-primary" type="button" @click="onConfirm">
            Finish withdrawing (step 2 of 2)
          </button>
        </template>
      </template>

      <template v-else-if="phase === 'sending'">
        <p class="status" aria-live="polite">
          Approve in Nimiq Pay
        </p>
        <p class="hint">
          Step {{ step }} of 2. Waiting for your approval. Keep the app open.
        </p>
      </template>

      <template v-else-if="phase === 'confirmingChain'">
        <p class="status" aria-live="polite">
          Checking the chain…
        </p>
      </template>

      <template v-else-if="phase === 'outcome' && outcome">
        <h3>{{ (almostDone ? ALMOST_DONE_COPY : TX_OUTCOME_COPY)[outcome].title }}</h3>
        <p>{{ outcome === 'timedOut' && timedOutRetryAllowed ? 'Nothing changed. You can try again.' : (almostDone ? ALMOST_DONE_COPY : TX_OUTCOME_COPY)[outcome].message }}</p>
        <button v-if="outcome === 'declined' && !almostDone" class="btn-primary" type="button" @click="close">
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
        <p>Your NIM is back in your wallet.</p>
        <button class="btn-primary" type="button" @click="close">
          Close
        </button>
      </template>

      <template v-else-if="phase === 'sentPending'">
        <h3>Sent</h3>
        <p>{{ sentPendingMessage }}</p>
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
