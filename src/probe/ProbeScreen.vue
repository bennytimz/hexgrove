<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { nimToLuna } from '../lib/luna'
import { getHostNetwork, getProvider, NimiqProviderError, resetProvider } from '../nimiq/provider'

/**
 * Hidden probe for build-order step 2: settling spec open questions 1-6 on
 * real testnet. Not the real staking UI. Reports raw outcomes only — never
 * claims anything is verified.
 */

interface LogEntry {
  id: number
  time: string
  method: string
  argsText: string
  status: 'pending' | 'ok' | 'error'
  resultText: string
}

type Phase = 'connecting' | 'unavailable' | 'ready'

const phase = ref<Phase>('connecting')
const network = ref<'mainnet' | 'testnet' | undefined>(undefined)
const addresses = ref<string[]>([])
const address = ref<string>('')
const sending = ref(false)

const isTestnet = computed(() => network.value === 'testnet')
const canAct = computed(() => phase.value === 'ready' && isTestnet.value && !sending.value)

const log = ref<LogEntry[]>([])
let nextLogId = 1
const copyStatus = ref('')

function shortAddr(addr: string): string {
  const parts = addr.split(' ').filter(Boolean)
  if (parts.length <= 3)
    return addr
  return `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}`
}

function describeError(error: unknown): string {
  if (NimiqProviderError.is(error))
    return `NimiqProviderError type=${error.type} code=${error.code ?? 'n/a'} message=${error.message}`
  if (error instanceof Error)
    return `${error.name}: ${error.message}`
  return String(error)
}

function pushLog(method: string, args: Record<string, unknown>): number {
  const id = nextLogId++
  log.value.unshift({
    id,
    time: new Date().toLocaleTimeString(),
    method,
    argsText: JSON.stringify(args),
    status: 'pending',
    resultText: '…',
  })
  return id
}

function updateLog(id: number, status: 'ok' | 'error', resultText: string) {
  const entry = log.value.find(e => e.id === id)
  if (entry) {
    entry.status = status
    entry.resultText = resultText
  }
}

async function copyLog() {
  const text = log.value
    .map(e => `[${e.time}] ${e.method} ${e.argsText} -> ${e.status}: ${e.resultText}`)
    .join('\n')
  try {
    await navigator.clipboard.writeText(text || '(empty log)')
    copyStatus.value = 'Copied.'
  }
  catch {
    copyStatus.value = 'Could not copy automatically — select the log text manually.'
  }
  setTimeout(() => {
    copyStatus.value = ''
  }, 2500)
}

async function connect() {
  phase.value = 'connecting'
  resetProvider()
  try {
    const nimiq = await getProvider()
    network.value = getHostNetwork()
    const accounts = await nimiq.listAccounts()
    addresses.value = accounts
    address.value = accounts[0] ?? ''
    phase.value = 'ready'
  }
  catch (error) {
    console.error('Probe: provider unavailable', error)
    phase.value = 'unavailable'
  }
}

onMounted(connect)

/** Luna fields are typed `number` by the SDK; amounts here never need BigInt range. */
function parseLunaField(label: string, nimAmount: string): number {
  if (!nimAmount.trim())
    throw new RangeError(`${label} is required`)
  return Number(nimToLuna(nimAmount))
}

function parseOptionalFeeLuna(feeLuna: string): number | undefined {
  if (!feeLuna.trim())
    return undefined
  const n = Number.parseInt(feeLuna, 10)
  if (!Number.isFinite(n) || n < 0)
    throw new RangeError('Fee must be a non-negative whole number of Luna')
  return n
}

async function execute(
  method: string,
  buildParams: () => Record<string, unknown>,
  call: (params: Record<string, unknown>) => Promise<string>,
) {
  if (!canAct.value)
    return

  sending.value = true
  let params: Record<string, unknown> = {}
  let buildError: unknown = null
  try {
    params = buildParams()
  }
  catch (error) {
    buildError = error
  }

  const id = pushLog(method, params)

  if (buildError) {
    updateLog(id, 'error', describeError(buildError))
    sending.value = false
    return
  }

  try {
    const hash = await call(params)
    updateLog(id, 'ok', `tx hash: ${hash}`)
  }
  catch (error) {
    updateLog(id, 'error', describeError(error))
  }
  finally {
    sending.value = false
  }
}

// --- Action 1: create staker (first stake). Open question 4 (minimum stake). ---
const createDelegation = ref('')
const createAmount = ref('100')
const createFee = ref('')

function createStaker() {
  return execute(
    'sendNewStakerTransaction',
    () => {
      const params: Record<string, unknown> = {
        delegation: createDelegation.value.trim(),
        value: parseLunaField('Amount', createAmount.value),
      }
      if (!params.delegation)
        throw new RangeError('Delegation (validator address) is required')
      const fee = parseOptionalFeeLuna(createFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendNewStakerTransaction(params as any),
  )
}

// --- Action 2: add stake. Open question 4 (minimum stake). ---
const addAmount = ref('50')
const addFee = ref('')

function addStake() {
  return execute(
    'sendStakeTransaction',
    () => {
      const params: Record<string, unknown> = { value: parseLunaField('Amount', addAmount.value) }
      const fee = parseOptionalFeeLuna(addFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendStakeTransaction(params as any),
  )
}

// --- Action 3: set active stake. Open questions 1 (partial stop) and 2 (reactivate). ---
const setActiveAmount = ref('0')
const setActiveFee = ref('')

function setActiveStake() {
  return execute(
    'sendSetActiveStakeTransaction',
    () => {
      const params: Record<string, unknown> = { newActiveBalance: parseLunaField('New active balance', setActiveAmount.value) }
      const fee = parseOptionalFeeLuna(setActiveFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendSetActiveStakeTransaction(params as any),
  )
}

// --- Action 4: update staker / switch validator. Open question 6. ---
const updateNewDelegation = ref('')
const updateReactivateAll = ref(false)
const updateFee = ref('')

function updateStaker() {
  return execute(
    'sendUpdateStakerTransaction',
    () => {
      const newDelegation = updateNewDelegation.value.trim()
      if (!newDelegation)
        throw new RangeError('New delegation (validator address) is required')
      const params: Record<string, unknown> = { newDelegation }
      if (updateReactivateAll.value)
        params.reactivateAllStake = true
      const fee = parseOptionalFeeLuna(updateFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendUpdateStakerTransaction(params as any),
  )
}

// --- Action 5: retire stake (withdraw step 1). Open question 5. ---
const retireAmount = ref('')
const retireFee = ref('')

function retireStake() {
  return execute(
    'sendRetireStakeTransaction',
    () => {
      const params: Record<string, unknown> = { retireStake: parseLunaField('Retire amount', retireAmount.value) }
      const fee = parseOptionalFeeLuna(retireFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendRetireStakeTransaction(params as any),
  )
}

// --- Action 6: remove stake / withdraw (step 2). Open question 5. ---
// NimJar's experience (testnet, 14 Sep 2026): value + fee must exactly equal
// the retired balance, or the remainder (sub-100-NIM) is rejected by the
// staking contract. Default fee to 0 for that reason; still user-editable.
const removeAmount = ref('')
const removeFee = ref('0')

function removeStake() {
  return execute(
    'sendRemoveStakeTransaction',
    () => {
      const params: Record<string, unknown> = { value: parseLunaField('Withdraw amount', removeAmount.value) }
      const fee = parseOptionalFeeLuna(removeFee.value)
      if (fee !== undefined)
        params.fee = fee
      return params
    },
    async params => (await getProvider()).sendRemoveStakeTransaction(params as any),
  )
}

// --- Chain state panel. Read-only: works regardless of network. ---
const rpcUrl = ref('https://rpc.testnet.nimiqwatch.com')
const chainStateText = ref('Not loaded yet.')
const chainStateLoading = ref(false)
const chainStateAt = ref('')

async function refreshChainState() {
  chainStateLoading.value = true
  try {
    const nimiq = await getProvider()
    nimiq.setRPCUrl(rpcUrl.value.trim())

    const stakerPromise = address.value
      ? nimiq.request({ method: 'getStakerByAddress', params: [address.value] }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (/no staker with address/i.test(message))
            return { note: 'No staker record yet for this address.' }
          return { error: describeError(error) }
        })
      : Promise.resolve({ note: 'No address selected.' })

    const policyPromise = nimiq.request({ method: 'getPolicyConstants' }).catch((error: unknown) => ({ error: describeError(error) }))

    const [blockNumber, staker, policy] = await Promise.all([
      nimiq.getBlockNumber(),
      stakerPromise,
      policyPromise,
    ])

    chainStateText.value = JSON.stringify({ blockNumber, staker, policy }, null, 2)
    chainStateAt.value = new Date().toLocaleTimeString()
  }
  catch (error) {
    chainStateText.value = `Could not load chain state: ${describeError(error)}`
  }
  finally {
    chainStateLoading.value = false
  }
}
</script>

<template>
  <main class="probe">
    <header class="head">
      <h1>Hexgrove staking probe</h1>
      <p class="hint">
        Build order step 2. Not the real staking UI — this only reports what each call actually did,
        against spec open questions 1-6.
      </p>
    </header>

    <section v-if="phase === 'connecting'" class="panel">
      <p class="status">
        Connecting to Nimiq Pay…
      </p>
    </section>

    <section v-else-if="phase === 'unavailable'" class="panel" role="alert">
      <h2>Couldn't reach Nimiq Pay</h2>
      <button class="btn" type="button" @click="connect">
        Try again
      </button>
    </section>

    <template v-else>
      <section class="panel">
        <p>
          Account:
          <select v-if="addresses.length > 1" v-model="address">
            <option v-for="a in addresses" :key="a" :value="a">
              {{ shortAddr(a) }}
            </option>
          </select>
          <b v-else>{{ address ? shortAddr(address) : '(none)' }}</b>
        </p>
        <p>
          Network: <b>{{ network ?? 'unknown' }}</b>
        </p>
      </section>

      <section v-if="!isTestnet" class="panel refuse" role="alert">
        <h2>Refusing to run any staking action</h2>
        <p>
          This probe only runs on testnet. getHostNetwork() reports
          <b>{{ network ?? 'unknown (not inside Nimiq Pay, or an old host)' }}</b>.
          Switch Nimiq Pay to testnet (long-press the settings button for 10 seconds) and reload.
        </p>
      </section>

      <section class="panel">
        <h2>Chain state</h2>
        <p class="hint">
          Raw getStakerByAddress / getPolicyConstants via nimiq.request(). inactiveFrom and
          inactiveRelease answer open question 3. Read-only, works on any network.
        </p>
        <label class="field">
          RPC URL
          <input v-model="rpcUrl" type="text">
        </label>
        <button class="btn" type="button" :disabled="chainStateLoading" @click="refreshChainState">
          {{ chainStateLoading ? 'Loading…' : 'Refresh chain state' }}
        </button>
        <p v-if="chainStateAt" class="hint">
          Last refreshed {{ chainStateAt }}
        </p>
        <pre class="log-pre">{{ chainStateText }}</pre>
      </section>

      <section class="panel">
        <h2>1 — Create staker (first stake)</h2>
        <p class="hint">
          Open question 4: the real minimum stake.
        </p>
        <label class="field">Delegation (validator address)
          <input v-model="createDelegation" type="text" placeholder="NQ...">
        </label>
        <label class="field">Amount (NIM)
          <input v-model="createAmount" type="text">
        </label>
        <label class="field">Fee (Luna, optional)
          <input v-model="createFee" type="text" placeholder="leave blank for automatic">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="createStaker">
          Create staker: stake {{ createAmount || '0' }} NIM to {{ createDelegation ? shortAddr(createDelegation) : '(no delegation set)' }}
        </button>
      </section>

      <section class="panel">
        <h2>2 — Add stake</h2>
        <p class="hint">
          Open question 4: the real minimum stake, on an existing staker.
        </p>
        <label class="field">Amount (NIM)
          <input v-model="addAmount" type="text">
        </label>
        <label class="field">Fee (Luna, optional)
          <input v-model="addFee" type="text" placeholder="leave blank for automatic">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="addStake">
          Add stake: {{ addAmount || '0' }} NIM
        </button>
      </section>

      <section class="panel">
        <h2>3 — Set active stake</h2>
        <p class="hint">
          Open questions 1 (does a partial amount work?) and 2 (can you reactivate after the wait is
          over?). This is the amount that stays actively earning — not the amount removed. 0 stops
          everything.
        </p>
        <label class="field">New active balance (NIM)
          <input v-model="setActiveAmount" type="text">
        </label>
        <label class="field">Fee (Luna, optional)
          <input v-model="setActiveFee" type="text" placeholder="leave blank for automatic">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="setActiveStake">
          Set active stake to {{ setActiveAmount || '0' }} NIM
        </button>
      </section>

      <section class="panel">
        <h2>4 — Update staker (switch validator)</h2>
        <p class="hint">
          Open question 6: does switching require the whole stake to be inactive and released first?
        </p>
        <label class="field">New delegation (validator address)
          <input v-model="updateNewDelegation" type="text" placeholder="NQ...">
        </label>
        <label class="checkbox">
          <input v-model="updateReactivateAll" type="checkbox">
          Reactivate all stake
        </label>
        <label class="field">Fee (Luna, optional)
          <input v-model="updateFee" type="text" placeholder="leave blank for automatic">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="updateStaker">
          Update staker: switch delegation to {{ updateNewDelegation ? shortAddr(updateNewDelegation) : '(not set)' }}{{ updateReactivateAll ? ', reactivate all stake' : '' }}
        </button>
      </section>

      <section class="panel">
        <h2>5 — Retire stake (withdraw step 1)</h2>
        <p class="hint">
          Open question 5: exactly two approvals to withdraw?
        </p>
        <label class="field">Retire amount (NIM)
          <input v-model="retireAmount" type="text" placeholder="usually the inactive balance">
        </label>
        <label class="field">Fee (Luna, optional)
          <input v-model="retireFee" type="text" placeholder="leave blank for automatic">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="retireStake">
          Retire {{ retireAmount || '0' }} NIM
        </button>
      </section>

      <section class="panel">
        <h2>6 — Remove stake (withdraw step 2)</h2>
        <p class="hint">
          Open question 5, step 2. NimJar's testnet experience: value + fee must exactly equal the
          retired balance, or the leftover is rejected. Fee defaults to 0 for that reason.
        </p>
        <label class="field">Withdraw amount (NIM)
          <input v-model="removeAmount" type="text" placeholder="usually the full retired balance">
        </label>
        <label class="field">Fee (Luna)
          <input v-model="removeFee" type="text">
        </label>
        <button class="btn" type="button" :disabled="!canAct" @click="removeStake">
          Remove (withdraw) {{ removeAmount || '0' }} NIM, fee {{ removeFee || '0' }} Luna
        </button>
      </section>

      <section class="panel">
        <h2>Call log</h2>
        <button class="btn" type="button" @click="copyLog">
          Copy log
        </button>
        <span class="hint">{{ copyStatus }}</span>
        <ul class="log-list">
          <li v-for="entry in log" :key="entry.id" :class="`log-${entry.status}`">
            <span class="log-time">{{ entry.time }}</span>
            <b>{{ entry.method }}</b>
            <span class="log-args">{{ entry.argsText }}</span>
            <span class="log-result">{{ entry.status }}: {{ entry.resultText }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.probe {
  min-height: 100dvh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
  margin: 0 auto;
}

.head h1 {
  font-size: 18px;
  margin: 0 0 4px;
}

.hint {
  color: var(--mist);
  font-size: 13px;
  margin: 4px 0;
}

.status {
  color: var(--mist);
}

.panel {
  background: var(--deep);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
}

.panel h2 {
  font-size: 15px;
  margin: 0 0 4px;
}

.panel.refuse {
  border-color: #ff6b9d;
  background: #2a1620;
  color: #ff9dc0;
}

.field {
  display: block;
  font-size: 13px;
  color: var(--mist);
  margin: 8px 0;
}

.field input {
  display: block;
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--edge);
  background: var(--night);
  color: var(--text);
  font-size: 14px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--mist);
  margin: 8px 0;
}

.btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--edge);
  background: var(--gold);
  color: #1a1405;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  margin-top: 6px;
}

.btn:disabled {
  background: var(--line);
  color: var(--mist);
  cursor: not-allowed;
}

.log-pre {
  background: var(--night);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50dvh;
  overflow-y: auto;
}

.log-list li {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-time {
  color: var(--mist);
}

.log-args {
  font-family: monospace;
  word-break: break-word;
}

.log-result {
  font-weight: 700;
}

.log-ok .log-result {
  color: #6ee0b0;
}

.log-error .log-result {
  color: #ff9dc0;
}

.log-pending .log-result {
  color: var(--mist);
}
</style>
