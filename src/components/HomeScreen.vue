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
  | 'pickAccount'
  | 'ready'

type StakerState = 'loading' | 'error' | 'empty' | 'staked'

const phase = ref<Phase>('connecting')
const network = ref<'mainnet' | 'testnet' | undefined>(undefined)
const accounts = ref<string[]>([])
const selectedAddress = ref<string | null>(null)

const stakerState = ref<StakerState>('loading')
const stakedLuna = ref<bigint>(0n)
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
    if (result.length > 1) {
      phase.value = 'pickAccount'
    }
    else {
      selectAddress(result[0])
    }
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

function selectAddress(address: string) {
  selectedAddress.value = address
  phase.value = 'ready'
  loadStaker()
}

/** Reads the staker record from chain, the same RPC call the probe uses. */
async function loadStaker() {
  stakerState.value = 'loading'
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(DEFAULT_TESTNET_RPC_URL)
    const staker = await nimiq.request<{ balance?: number } | null>({
      method: 'getStakerByAddress',
      params: [selectedAddress.value],
    })

    const balance = staker && typeof staker.balance === 'number' ? staker.balance : 0
    if (balance > 0) {
      stakedLuna.value = BigInt(balance)
      stakerState.value = 'staked'
    }
    else {
      stakerState.value = 'empty'
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no staker with address/i.test(message)) {
      stakerState.value = 'empty'
    }
    else {
      console.error('Could not load staker state:', error)
      stakerState.value = 'error'
    }
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

    <section v-else-if="phase === 'pickAccount'" class="panel">
      <h1>Choose an account</h1>
      <p class="hint">Basic accounts only.</p>
      <ul class="account-list">
        <li v-for="address in accounts" :key="address">
          <button class="account-row" type="button" @click="selectAddress(address)">
            {{ shortAddr(address) }}
          </button>
        </li>
      </ul>
    </section>

    <section v-else-if="phase === 'ready' && selectedAddress" class="panel">
      <div class="stat">
        <small>Account</small>
        <b :title="selectedAddress">{{ shortAddr(selectedAddress) }}</b>
      </div>

      <p v-if="stakerState === 'loading'" class="status">
        Loading your stake…
      </p>

      <template v-else-if="stakerState === 'error'">
        <p class="hint" role="alert">
          Can't load your stake right now.
        </p>
        <button class="btn-ghost" type="button" @click="loadStaker">
          Try again
        </button>
      </template>

      <template v-else-if="stakerState === 'empty'">
        <h1>Stake NIM. Grow a garden.</h1>
        <p>Staking NIM grows a garden of hex plots. Rewards vary, and stopping takes time.</p>
        <button class="btn-primary" type="button" @click="onStakeClick">
          Stake
        </button>
        <p v-if="stakeComingSoon" class="hint">
          Staking isn't built yet.
        </p>
      </template>

      <template v-else-if="stakerState === 'staked'">
        <div class="stat">
          <small>Staked</small>
          <b>{{ formatNim(stakedLuna) }} NIM</b>
        </div>
        <div class="stat">
          <small>Plots</small>
          <b>{{ plotsForStake(stakedLuna) }}</b>
        </div>
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

.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-row {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
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
