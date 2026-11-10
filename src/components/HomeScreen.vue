<script setup lang="ts">
import type { NimiqProvider } from '../nimiq/provider'
import type { PlantData } from '../lib/plants'
import type { SkyCondition } from '../lib/sky'
import type { WaitingPhase } from '../lib/waiting'
import type { StoredWatering } from '../lib/watering'
import type { ActiveValidatorFields } from '../lib/yield'
import { computed, onMounted, ref } from 'vue'
import HexGarden from './HexGarden.vue'
import StakeSheet from './StakeSheet.vue'
import StopEarningSheet from './StopEarningSheet.vue'
import WithdrawSheet from './WithdrawSheet.vue'
import { formatNim, LUNA_PER_NIM, shortfallLuna } from '../lib/luna'
import { PREVIEW_PLANTS } from '../lib/plants'
import { nextTier, plotsForStake } from '../lib/plots'
import { compactAddress, computeSkyState, isValidatorHealthy } from '../lib/sky'
import { computeWateringState, waterToday } from '../lib/watering'
import { describeWaitingState, releaseBlock } from '../lib/waiting'
import { estimatedYearlyRewardLuna, networkRate, totalActiveStakeLuna, validatorRate } from '../lib/yield'
import { getHostNetwork, getProvider, NimiqProviderError, resetProvider, rpcUrlForNetwork } from '../nimiq/provider'
import { readPolicyConstants } from '../nimiq/policy'
import { readCombinedStaker } from '../nimiq/staker'
import { fetchValidatorsDirectory } from '../nimiq/validatorsApi'
import { playChime, WATERING_CHIME } from '../sound/chime'

const MUTED_STORAGE_KEY = 'hexgrove.muted'

type Phase =
  | 'connecting'
  | 'unavailable'
  | 'checkingConsensus'
  | 'syncing'
  | 'loadingAccounts'
  | 'accountDeclined'
  | 'accountError'
  | 'ready'

type CombinedState = 'loading' | 'error' | 'empty' | 'staked' | 'hidden'

/** Remembers spendable balance across reloads in this tab, to tell "never staked" from "staked somewhere we can't see". */
const SPENDABLE_STORAGE_KEY = 'hexgrove.lastSpendableLuna'

const phase = ref<Phase>('connecting')
const network = ref<'mainnet' | 'testnet' | undefined>(undefined)
const accounts = ref<string[]>([])

const combinedState = ref<CombinedState>('loading')
const spendableLuna = ref(0)
const spendableUnsupported = ref(false)
/** True if any address's getBalance call failed — shown instead of silently treating a failed read as a 0 balance. */
const spendableLoadFailed = ref(false)
/** The live minimum stake, read alongside policy in loadCombined() — used only for the empty-state hint below, never hardcoded. */
const minimumStakeLuna = ref<bigint | null>(null)
const earningLuna = ref<bigint>(0n)
const waitingLuna = ref<bigint>(0n)
/** The waiting countdown's current phase and copy — see src/lib/waiting.ts, docs/SPEC.md "Unstaking timing" (DOCUMENTED, NOT YET VERIFIED ON CHAIN). */
const waitingPhase = ref<WaitingPhase | null>(null)
const waitingText = ref('')
const waitingCaveat = ref('')
const releasedLuna = ref<bigint>(0n)
const stakeHolders = ref<string[]>([])
const delegationAddress = ref<string | null>(null)
const stakeSheetMode = ref<'create' | 'add' | null>(null)
const stopEarningSheetOpen = ref(false)
const withdrawSheetOpen = ref(false)
const latestInactiveFrom = ref<number | null>(null)
const blocksPerEpoch = ref<number | null>(null)
const currentBlockNumber = ref<number | null>(null)
/** Past the release block, with funds still waiting — Withdraw becomes reachable. UNVERIFIED, see docs/SPEC.md. */
const readyToWithdraw = computed(() => {
  if (waitingLuna.value <= 0n || latestInactiveFrom.value === null || blocksPerEpoch.value === null || currentBlockNumber.value === null)
    return false
  return currentBlockNumber.value >= releaseBlock(latestInactiveFrom.value, blocksPerEpoch.value)
})

const initialSky = computeSkyState(null)
const skyCondition = ref<SkyCondition>(initialSky.condition)
const skyLabel = ref(initialSky.label)
/** Estimated reward over the next year at the current rate and the validator's fee (src/lib/yield.ts). Null hides the line entirely — never a placeholder. */
const yearlyRewardLuna = ref<number | null>(null)

const watered = ref(false)
const streak = ref(0)
const pulse = ref(false)
const muted = ref(localStorage.getItem(MUTED_STORAGE_KEY) === '1')

const previewing = ref(false)
function togglePreview() {
  previewing.value = !previewing.value
}

/** All Seed stage: growth and species await reward reading, a later build step. */
const realPlants = computed<PlantData[]>(() => {
  const count = plotsForStake(earningLuna.value)
  return Array.from({ length: count }, () => ({ species: 'daisy' as const, stage: 0 }))
})

/**
 * Faint outlines for the next tier, with how much more NIM unlocks them.
 * Deliberately shows locked plots — a documented exception to the spec's
 * "don't tease locked plots" rule, see docs/SPEC.md.
 */
const lockedInfo = computed(() => {
  const next = nextTier(earningLuna.value)
  if (!next)
    return null
  const count = next.plots - realPlants.value.length
  const deltaLuna = next.thresholdLuna - earningLuna.value
  return {
    count,
    hint: `${formatNim(deltaLuna)} more NIM unlocks ${count} more plot${count === 1 ? '' : 's'}`,
  }
})

const deepLink = `nimiqpay://miniapp?url=${encodeURIComponent(location.href)}`

function shortAddr(address: string): string {
  const parts = address.split(' ').filter(Boolean)
  if (parts.length <= 3)
    return address
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
}

/** Rounds to the nearest whole NIM before formatting — an estimate shouldn't claim 5-decimal precision. */
function formatYearlyEstimate(luna: number): string {
  const lunaPerNim = Number(LUNA_PER_NIM)
  return formatNim(Math.round(luna / lunaPerNim) * lunaPerNim)
}

async function connect() {
  phase.value = 'connecting'
  resetProvider()
  try {
    const nimiq = await getProvider()
    await checkConsensus(nimiq)
  }
  catch (error) {
    console.error('Nimiq provider unavailable:', error)
    phase.value = 'unavailable'
  }
}

async function checkConsensus(nimiq: NimiqProvider) {
  phase.value = 'checkingConsensus'
  try {
    const established = await nimiq.isConsensusEstablished()
    if (!established) {
      phase.value = 'syncing'
      return
    }
    await loadAccounts(nimiq)
  }
  catch (error) {
    console.error('Could not check Nimiq Pay consensus:', error)
    phase.value = 'syncing'
  }
}

async function retryConsensus() {
  try {
    const nimiq = await getProvider()
    await checkConsensus(nimiq)
  }
  catch (error) {
    console.error('Nimiq provider unavailable:', error)
    phase.value = 'unavailable'
  }
}

async function loadAccounts(nimiq: NimiqProvider) {
  phase.value = 'loadingAccounts'
  try {
    const result = await nimiq.listAccounts()
    accounts.value = result
    network.value = getHostNetwork()
    phase.value = 'ready'
    loadWatering()
    loadCombined()
  }
  catch (error) {
    if (NimiqProviderError.is(error) && error.type === 'PERMISSION_DENIED') {
      phase.value = 'accountDeclined'
    }
    else {
      console.error('Could not list Nimiq accounts:', error)
      phase.value = 'accountError'
    }
  }
}

async function retryAccounts() {
  try {
    const nimiq = await getProvider()
    await loadAccounts(nimiq)
  }
  catch (error) {
    console.error('Nimiq provider unavailable:', error)
    phase.value = 'unavailable'
  }
}

/**
 * Sky from the user's own delegation validator: getActiveValidators for
 * active/jailed/retired (chain RPC, authoritative), plus the Validators
 * API's reliability score when it's reachable and has this validator,
 * restoring the spec's Sunny/Cloudy/Stormy score table on top — additive;
 * falls back to the plain active/not-active signal otherwise (see
 * src/lib/sky.ts, docs/SPEC.md open question 9). Dusk covers both "no
 * delegation yet" and "lookup failed or validator not found", never
 * Stormy just because data is missing.
 */
async function loadSky(nimiq: NimiqProvider, delegation: string | null) {
  if (!delegation) {
    const state = computeSkyState(null)
    skyCondition.value = state.condition
    skyLabel.value = state.label
    yearlyRewardLuna.value = null
    return
  }

  try {
    const [validators, directory] = await Promise.all([
      nimiq.request<unknown>({ method: 'getActiveValidators' }),
      fetchValidatorsDirectory(network.value),
    ])
    const match = Array.isArray(validators)
      ? validators.find((v): v is { address: string, retired?: boolean, inactivityFlag?: unknown, jailedFrom?: unknown } =>
          !!v && typeof v === 'object' && typeof (v as { address?: unknown }).address === 'string'
          && compactAddress((v as { address: string }).address) === compactAddress(delegation))
      : undefined
    const directoryEntry = directory.find(d => compactAddress(d.address) === compactAddress(delegation))
    const state = computeSkyState(match ?? null, directoryEntry?.scoreTotal ?? null)
    skyCondition.value = state.condition
    skyLabel.value = state.label

    const activeStakeLuna = totalActiveStakeLuna(
      (Array.isArray(validators) ? validators : []) as ActiveValidatorFields[],
      isValidatorHealthy,
    )
    const rate = validatorRate(networkRate(Date.now(), activeStakeLuna), directoryEntry?.feeFraction ?? null)
    yearlyRewardLuna.value = estimatedYearlyRewardLuna(Number(earningLuna.value), rate)
  }
  catch (error) {
    console.error('Could not load validator state:', error)
    const state = computeSkyState(null)
    skyCondition.value = state.condition
    skyLabel.value = state.label
    yearlyRewardLuna.value = null
  }
}

/**
 * No account picker: looks up balance and staker state for every address
 * listAccounts returned, and combines them. This only checks what
 * listAccounts gave us — a stake can be registered under a different
 * address entirely (see docs/SPEC.md, testnet observations, NQ59 vs NQ41).
 */
async function loadCombined() {
  combinedState.value = 'loading'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrlForNetwork(network.value))

    spendableLoadFailed.value = false
    if (typeof nimiq.getBalance === 'function') {
      spendableUnsupported.value = false
      let anyBalanceError = false
      const balances = await Promise.all(accounts.value.map(async (addr) => {
        try {
          return await nimiq.getBalance(addr)
        }
        catch (error) {
          console.error(`Could not load balance for ${addr}:`, error)
          anyBalanceError = true
          return 0
        }
      }))
      spendableLoadFailed.value = anyBalanceError
      spendableLuna.value = balances.reduce((sum, b) => sum + b, 0)
    }
    else {
      spendableUnsupported.value = true
      spendableLuna.value = 0
    }

    const [blockNumber, staker, policy] = await Promise.all([
      nimiq.getBlockNumber(),
      readCombinedStaker(nimiq, accounts.value),
      readPolicyConstants(nimiq),
    ])

    minimumStakeLuna.value = policy.minimumStakeLuna
    earningLuna.value = staker.earningLuna
    waitingLuna.value = staker.waitingLuna
    releasedLuna.value = staker.releasedLuna
    stakeHolders.value = staker.holders
    delegationAddress.value = staker.delegation
    latestInactiveFrom.value = staker.latestInactiveFrom
    blocksPerEpoch.value = policy.blocksPerEpoch
    currentBlockNumber.value = blockNumber

    await loadSky(nimiq, staker.delegation)

    if (staker.waitingLuna > 0n && staker.latestInactiveFrom !== null) {
      const state = describeWaitingState(blockNumber, staker.latestInactiveFrom, policy.blocksPerEpoch)
      waitingPhase.value = state.phase
      // The amount isn't known inside describeWaitingState (it only reasons about
      // block numbers) — composed here instead, for the one phase that names it.
      waitingText.value = state.phase === 'ready'
        ? `Your ${formatNim(staker.waitingLuna)} NIM can move back to your wallet. This takes two approvals.`
        : state.text
      waitingCaveat.value = state.caveat ?? ''
    }
    else {
      waitingPhase.value = null
      waitingText.value = ''
      waitingCaveat.value = ''
    }

    const previousRaw = sessionStorage.getItem(SPENDABLE_STORAGE_KEY)
    const previousSpendable = previousRaw !== null ? Number(previousRaw) : null
    const balanceKnown = !spendableUnsupported.value && !spendableLoadFailed.value
    const droppedRecently = balanceKnown && previousSpendable !== null && spendableLuna.value < previousSpendable
    if (balanceKnown) {
      sessionStorage.setItem(SPENDABLE_STORAGE_KEY, String(spendableLuna.value))
    }

    if (staker.earningLuna > 0n || staker.waitingLuna > 0n || staker.releasedLuna > 0n) {
      combinedState.value = 'staked'
    }
    else if (staker.anyError) {
      combinedState.value = 'error'
    }
    else if (droppedRecently) {
      // No staker record under any listAccounts address, but the balance we
      // can see dropped since last time — likely staked under an address we
      // can't see (see docs/SPEC.md, NQ59 vs NQ41), not never-staked.
      combinedState.value = 'hidden'
    }
    else {
      combinedState.value = 'empty'
    }
  }
  catch (error) {
    console.error('Could not load account state:', error)
    combinedState.value = 'error'
  }
}

function onStaked() {
  stakeSheetMode.value = null
  loadCombined()
}

function onStopped() {
  stopEarningSheetOpen.value = false
  loadCombined()
}

function onWithdrawn() {
  withdrawSheetOpen.value = false
  loadCombined()
}

/**
 * Keyed by every address from listAccounts together, since the stake can
 * sit under an address other than the one someone thinks of as "theirs"
 * (see docs/SPEC.md, NQ59 vs NQ41) — this stays stable either way.
 */
function wateringStorageKey(): string {
  return `hexgrove.watering.${[...accounts.value].sort().join('|')}`
}

function readStoredWatering(): StoredWatering | null {
  const raw = localStorage.getItem(wateringStorageKey())
  return raw ? JSON.parse(raw) as StoredWatering : null
}

function loadWatering() {
  const state = computeWateringState(readStoredWatering(), new Date())
  watered.value = state.watered
  streak.value = state.streak
}

/** Watering is visual only. It never changes rewards, and never touches chain state. */
function onWaterClick() {
  if (watered.value)
    return
  const next = waterToday(readStoredWatering(), new Date())
  localStorage.setItem(wateringStorageKey(), JSON.stringify(next))
  watered.value = true
  streak.value = next.streak

  pulse.value = true
  setTimeout(() => {
    pulse.value = false
  }, 900)

  if (!muted.value) {
    playChime(WATERING_CHIME)
  }
}

function toggleMute() {
  muted.value = !muted.value
  localStorage.setItem(MUTED_STORAGE_KEY, muted.value ? '1' : '0')
}

const isMock = window.__HEXGROVE_MOCK__ === true

onMounted(connect)
</script>

<template>
  <main class="connect">
    <div v-if="isMock" class="mock-banner" role="status">
      Mock data, not real Nimiq Pay behavior
    </div>
    <div class="brand">
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="#F6B221" />
        <path d="M12 7.5c-2.4 1.7-2.4 5 0 7.8 2.4-2.8 2.4-6.1 0-7.8z" fill="#0B1230" />
      </svg>
      <span>Hexgrove</span>
      <div class="brand-right">
        <span v-if="network === 'testnet'" class="badge" role="status">Testnet</span>
        <button
          class="icon-btn" type="button" :aria-pressed="!muted"
          :aria-label="muted ? 'Turn sound on' : 'Mute sound'" @click="toggleMute"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3,9 7,9 12,4 12,20 7,15 3,15" fill="currentColor" stroke="none" />
            <template v-if="!muted">
              <path d="M16 8a5 5 0 0 1 0 8" />
              <path d="M19 5a9 9 0 0 1 0 14" />
            </template>
            <template v-else>
              <line x1="16" y1="9" x2="21" y2="14" />
              <line x1="21" y1="9" x2="16" y2="14" />
            </template>
          </svg>
        </button>
      </div>
    </div>

    <section v-if="phase === 'connecting'" class="panel" aria-live="polite">
      <p class="status">Connecting to Nimiq Pay…</p>
    </section>

    <section v-else-if="phase === 'unavailable'" class="panel">
      <h1>Open Hexgrove in Nimiq Pay</h1>
      <p>Hexgrove is a Nimiq Pay mini app. It needs to run inside Nimiq Pay to show your account and balance.</p>
      <p class="hint">Already in Nimiq Pay? It may still be starting up.</p>
      <a class="btn-primary" :href="deepLink">Open in Nimiq Pay</a>
      <button class="btn-ghost" type="button" @click="connect">
        Try again
      </button>
      <p class="hint">
        How to open it in Nimiq Pay: in the app, go to Mini Apps, choose Custom URL, and paste this page's address.
      </p>
      <a class="btn-ghost" href="https://github.com/bennytimz/hexgrove" target="_blank" rel="noopener">
        View the code on GitHub
      </a>
      <button class="btn-ghost" type="button" @click="togglePreview">
        {{ previewing ? 'Exit preview' : 'Preview a mature garden' }}
      </button>
      <template v-if="previewing">
        <div class="preview-banner" role="status">
          Preview: a sample garden, not yours
        </div>
        <HexGarden :plants="PREVIEW_PLANTS" :watered="true" sky-condition="sunny" sky-label="Sample conditions" />
      </template>
    </section>

    <section v-else-if="phase === 'checkingConsensus'" class="panel" aria-live="polite">
      <p class="status">Checking network status…</p>
    </section>

    <section v-else-if="phase === 'syncing'" class="panel" role="alert">
      <h1>Nimiq Pay is still syncing</h1>
      <p>Hold on while Nimiq Pay catches up with the network, then try again.</p>
      <button class="btn-primary" type="button" @click="retryConsensus">
        Try again
      </button>
    </section>

    <section v-else-if="phase === 'loadingAccounts'" class="panel" aria-live="polite">
      <p class="status">Loading your account…</p>
    </section>

    <section v-else-if="phase === 'accountDeclined'" class="panel" role="alert">
      <h1>We need your account</h1>
      <p>Hexgrove needs your Nimiq account address to show your stake and balance. Nothing moves without your approval.</p>
      <button class="btn-primary" type="button" @click="retryAccounts">
        Try again
      </button>
    </section>

    <section v-else-if="phase === 'accountError'" class="panel" role="alert">
      <h1>Couldn't load your account</h1>
      <p>Something went wrong while reaching Nimiq Pay. Nothing was sent or changed.</p>
      <button class="btn-primary" type="button" @click="retryAccounts">
        Try again
      </button>
    </section>

    <section v-else-if="phase === 'ready'" class="panel">
      <p v-if="combinedState === 'loading'" class="status">
        Loading your accounts…
      </p>

      <template v-else-if="combinedState === 'error'">
        <p class="hint" role="alert">
          Can't load your accounts right now.
        </p>
        <button class="btn-ghost" type="button" @click="loadCombined">
          Try again
        </button>
      </template>

      <template v-else>
        <div class="stat">
          <small>Spendable</small>
          <template v-if="spendableLoadFailed">
            <span class="hint" role="alert">Can't load this right now.</span>
            <button class="btn-ghost" type="button" @click="loadCombined">
              Try again
            </button>
          </template>
          <b v-else-if="!spendableUnsupported">{{ formatNim(spendableLuna) }} NIM</b>
          <span v-else class="hint">Update Nimiq Pay to see this.</span>
        </div>

        <button class="btn-ghost" type="button" @click="togglePreview">
          {{ previewing ? 'Exit preview' : 'Preview a mature garden' }}
        </button>

        <template v-if="previewing">
          <div class="preview-banner" role="status">
            Preview: a sample garden, not yours
          </div>
          <HexGarden :plants="PREVIEW_PLANTS" :watered="true" sky-condition="sunny" sky-label="Sample conditions" />
        </template>

        <template v-else-if="combinedState === 'staked'">
          <div class="strip">
            <span class="streak">{{ streak > 0 ? `${streak}-day streak` : (watered ? '1-day streak' : 'Start your streak') }}</span>
            <span :class="['chip', watered ? 'ok' : '']">{{ watered ? 'Watered today' : 'Needs water' }}</span>
          </div>

          <HexGarden
            :plants="realPlants" :watered="watered" :pulse="pulse"
            :sky-condition="skyCondition" :sky-label="skyLabel"
            :locked-plots="lockedInfo?.count ?? 0" :unlock-hint="lockedInfo?.hint"
          />

          <div class="stat">
            <small>Staked and earning</small>
            <b>{{ formatNim(earningLuna) }} NIM</b>
          </div>
          <div v-if="yearlyRewardLuna !== null" class="stat">
            <small>Estimated per year</small>
            <b>About {{ formatYearlyEstimate(yearlyRewardLuna) }} NIM</b>
            <span class="hint">Estimate, never guaranteed. Based on your validator's fee and the network's current stake.</span>
          </div>
          <div v-if="waitingLuna > 0n" class="stat">
            <small>{{ waitingPhase === 'ready' ? 'Ready to withdraw' : 'Waiting to withdraw' }}</small>
            <b>{{ formatNim(waitingLuna) }} NIM</b>
            <span class="hint">{{ waitingText }}</span>
            <span v-if="waitingCaveat" class="hint">{{ waitingCaveat }}</span>
          </div>
          <div v-if="releasedLuna > 0n" class="stat">
            <small>Released</small>
            <b>{{ formatNim(releasedLuna) }} NIM</b>
            <span class="hint">Almost done. Your first approval went through. One more approval moves your {{ formatNim(releasedLuna) }} NIM to your wallet.</span>
          </div>
          <p class="hint">
            {{ stakeHolders.length > 1 ? 'Held across' : 'Held by' }} {{ stakeHolders.map(shortAddr).join(', ') }}
          </p>

          <button v-if="!watered" class="btn-primary" type="button" @click="onWaterClick">
            Water garden
          </button>
          <button v-else class="btn-quiet" type="button" disabled>
            Watered
          </button>
          <p class="hint">Watering is just for fun. It never changes your rewards.</p>
          <button class="btn-ghost" type="button" @click="stakeSheetMode = 'add'">
            Add stake
          </button>
          <button v-if="earningLuna > 0n" class="btn-ghost" type="button" @click="stopEarningSheetOpen = true">
            Stop earning
          </button>
          <button v-if="readyToWithdraw || releasedLuna > 0n" class="btn-ghost" type="button" @click="withdrawSheetOpen = true">
            {{ releasedLuna > 0n ? 'Finish withdrawing' : 'Withdraw' }}
          </button>
        </template>

        <template v-else-if="combinedState === 'hidden'">
          <h1>We can't see your stake yet</h1>
          <p>Pull to refresh.</p>
          <button class="btn-ghost" type="button" @click="loadCombined">
            Refresh
          </button>
        </template>

        <template v-else>
          <h1>Stake NIM. Grow a garden.</h1>
          <p>Staking NIM grows a garden of hex plots that fills in as your stake earns rewards. Rewards vary, and stopping takes time.</p>
          <p v-if="minimumStakeLuna !== null" class="hint">
            {{ !spendableLoadFailed && shortfallLuna(minimumStakeLuna, spendableLuna) > 0n
              ? `Staking needs at least ${formatNim(minimumStakeLuna)} NIM. You have ${formatNim(spendableLuna)} NIM.`
              : `Staking needs at least ${formatNim(minimumStakeLuna)} NIM.` }}
          </p>
          <button class="btn-primary" type="button" @click="stakeSheetMode = 'create'">
            Stake
          </button>
        </template>
      </template>
    </section>

    <StakeSheet
      v-if="stakeSheetMode"
      :addresses="accounts"
      :has-staker="stakeSheetMode === 'add'"
      :existing-delegation="delegationAddress"
      :spendable-luna="spendableLuna"
      @close="stakeSheetMode = null"
      @staked="onStaked"
    />
    <StopEarningSheet
      v-if="stopEarningSheetOpen"
      :addresses="accounts"
      :earning-luna="earningLuna"
      @close="stopEarningSheetOpen = false"
      @stopped="onStopped"
    />
    <WithdrawSheet
      v-if="withdrawSheetOpen"
      :addresses="accounts"
      @close="withdrawSheetOpen = false"
      @withdrawn="onWithdrawn"
    />
  </main>
</template>

<style scoped>
.connect {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  gap: 16px;
}

.mock-banner {
  width: 100%;
  max-width: 430px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid #ff6b9d;
  background: #2a1620;
  color: #ff9dc0;
  font-weight: 700;
  font-size: 13px;
  text-align: center;
}

.preview-banner {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1.5px solid var(--gold);
  background: #2a2007;
  color: var(--gold-soft);
  font-weight: 700;
  font-size: 13px;
  text-align: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 20px;
  width: 100%;
  max-width: 430px;
}

.brand-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--gold);
  color: var(--gold-soft);
  font-size: 13px;
  font-weight: 700;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--mist);
  display: grid;
  place-items: center;
  border-radius: 12px;
  cursor: pointer;
}

.icon-btn[aria-pressed='true'] {
  color: var(--gold);
}

.strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.streak {
  font-weight: 700;
  font-size: 14px;
}

.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--mist);
}

.chip.ok {
  border-color: var(--gold);
  color: var(--gold-soft);
}

.panel {
  width: 100%;
  max-width: 430px;
  background: var(--deep);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel h1 {
  margin: 0;
  font-size: 19px;
}

.panel p {
  margin: 0;
  color: var(--mist);
  line-height: 1.5;
}

.status {
  color: var(--mist);
  margin: 0;
}

.hint {
  color: var(--mist);
  font-size: 14px;
  margin: 0;
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
  text-decoration: none;
  cursor: pointer;
}

.btn-ghost {
  min-height: 44px;
  border-radius: 999px;
  border: 1.5px solid var(--edge);
  background: transparent;
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
}

.btn-quiet {
  min-height: 56px;
  border-radius: 999px;
  border: 1.5px solid var(--gold);
  background: transparent;
  color: var(--gold-soft);
  font-weight: 800;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat small {
  color: var(--mist);
  font-size: 12.5px;
}

.stat b {
  font-size: 23px;
  font-variant-numeric: tabular-nums;
}
</style>
