<script setup lang="ts">
import type { NimiqProvider } from '../nimiq/provider'
import { onMounted, ref } from 'vue'
import { formatNim } from '../lib/luna'
import { plotsForStake } from '../lib/plots'
import { DEFAULT_TESTNET_RPC_URL, getHostNetwork, getProvider, NimiqProviderError, resetProvider } from '../nimiq/provider'

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
const stakedLuna = ref<bigint>(0n)
const stakeHolders = ref<string[]>([])
const stakeComingSoon = ref(false)

const deepLink = `nimiqpay://miniapp?url=${encodeURIComponent(location.href)}`

function shortAddr(address: string): string {
  const parts = address.split(' ').filter(Boolean)
  if (parts.length <= 3)
    return address
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
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
 * No account picker: looks up balance and staker state for every address
 * listAccounts returned, and combines them. This only checks what
 * listAccounts gave us — a stake can be registered under a different
 * address entirely (see docs/SPEC.md, testnet observations, NQ59 vs NQ41).
 */
async function loadCombined() {
  combinedState.value = 'loading'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(DEFAULT_TESTNET_RPC_URL)

    if (typeof nimiq.getBalance === 'function') {
      spendableUnsupported.value = false
      const balances = await Promise.all(accounts.value.map(async (addr) => {
        try {
          return await nimiq.getBalance(addr)
        }
        catch (error) {
          console.error(`Could not load balance for ${addr}:`, error)
          return 0
        }
      }))
      spendableLuna.value = balances.reduce((sum, b) => sum + b, 0)
    }
    else {
      spendableUnsupported.value = true
      spendableLuna.value = 0
    }

    let totalStakedLuna = 0n
    const holders: string[] = []
    let anyRealError = false

    await Promise.all(accounts.value.map(async (addr) => {
      try {
        const staker = await nimiq.request<{ balance?: number } | null>({
          method: 'getStakerByAddress',
          params: [addr],
        })
        const balance = staker && typeof staker.balance === 'number' ? staker.balance : 0
        if (balance > 0) {
          totalStakedLuna += BigInt(balance)
          holders.push(addr)
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/no staker with address/i.test(message)) {
          console.error(`Could not load staker state for ${addr}:`, error)
          anyRealError = true
        }
      }
    }))

    stakedLuna.value = totalStakedLuna
    stakeHolders.value = holders

    const previousRaw = sessionStorage.getItem(SPENDABLE_STORAGE_KEY)
    const previousSpendable = previousRaw !== null ? Number(previousRaw) : null
    const droppedRecently = !spendableUnsupported.value && previousSpendable !== null && spendableLuna.value < previousSpendable
    if (!spendableUnsupported.value) {
      sessionStorage.setItem(SPENDABLE_STORAGE_KEY, String(spendableLuna.value))
    }

    if (totalStakedLuna > 0n) {
      combinedState.value = 'staked'
    }
    else if (anyRealError) {
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

function onStakeClick() {
  stakeComingSoon.value = true
  setTimeout(() => {
    stakeComingSoon.value = false
  }, 2000)
}

const isMock = window.__HEXGROVE_MOCK__ === true

onMounted(connect)
</script>

<template>
  <main class="connect">
    <div v-if="isMock" class="mock-banner" role="status">
      Mock data — not real Nimiq Pay behavior
    </div>
    <div class="brand">
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="#F6B221" />
        <path d="M12 7.5c-2.4 1.7-2.4 5 0 7.8 2.4-2.8 2.4-6.1 0-7.8z" fill="#0B1230" />
      </svg>
      <span>Hexgrove</span>
      <span v-if="network === 'testnet'" class="badge" role="status">Testnet</span>
    </div>

    <section v-if="phase === 'connecting'" class="panel" aria-live="polite">
      <p class="status">Connecting to Nimiq Pay…</p>
    </section>

    <section v-else-if="phase === 'unavailable'" class="panel" role="alert">
      <h1>Open Hexgrove in Nimiq Pay</h1>
      <p>We couldn't reach the Nimiq Pay provider. If you're already inside Nimiq Pay, it may still be starting up.</p>
      <a class="btn-primary" :href="deepLink">Open in Nimiq Pay</a>
      <button class="btn-ghost" type="button" @click="connect">
        Try again
      </button>
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
      <div class="stat">
        <small>{{ accounts.length > 1 ? 'Accounts' : 'Account' }}</small>
        <b class="addr-list">
          <span v-for="(a, i) in accounts" :key="a">{{ i > 0 ? ', ' : '' }}{{ shortAddr(a) }}</span>
        </b>
      </div>

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
          <b v-if="!spendableUnsupported">{{ formatNim(spendableLuna) }} NIM</b>
          <span v-else class="hint">Update Nimiq Pay to see this.</span>
        </div>

        <template v-if="combinedState === 'staked'">
          <div class="stat">
            <small>Staked</small>
            <b>{{ formatNim(stakedLuna) }} NIM</b>
          </div>
          <div class="stat">
            <small>Plots</small>
            <b>{{ plotsForStake(stakedLuna) }}</b>
          </div>
          <div class="stat">
            <small>{{ stakeHolders.length > 1 ? 'Held across' : 'Held by' }}</small>
            <b class="addr-list">
              <span v-for="(h, i) in stakeHolders" :key="h">{{ i > 0 ? ', ' : '' }}{{ shortAddr(h) }}</span>
            </b>
          </div>
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
          <p>Staking NIM grows a garden of hex plots. Rewards vary, and stopping takes time.</p>
          <button class="btn-primary" type="button" @click="onStakeClick">
            Stake
          </button>
          <p v-if="stakeComingSoon" class="hint">
            Staking isn't built yet.
          </p>
        </template>
      </template>
    </section>
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

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 20px;
  width: 100%;
  max-width: 430px;
}

.badge {
  margin-left: auto;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--gold);
  color: var(--gold-soft);
  font-size: 13px;
  font-weight: 700;
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
  cursor: pointer;
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

.addr-list {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
</style>
