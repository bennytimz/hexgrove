# Hexgrove

Hexgrove is a Nimiq Pay mini app: stake NIM, and a garden of hexagonal plots grows alongside it, drawn straight from your real stake on chain. Built for the Earn category of the Nimiq Mini Apps Competition, Cycle 3.

"Stake NIM. Grow a garden."

**Live:** https://hexgrove.vercel.app/
**Spec:** [`docs/SPEC.md`](docs/SPEC.md) (every decision, rule and confirmed fact)
**Mockup:** [`docs/hexgrove-mockup.html`](docs/hexgrove-mockup.html) (the visual and interaction reference)
**License:** MIT, see [`LICENSE`](LICENSE)

## How it works

Three signals drive the garden, and each one reads real data, not a placeholder:

- **Plots from your stake.** The number of hex plots is set by how much NIM is actively earning, read live from your staker record on chain every time the app opens.
- **Sky from your validator's health.** The weather above the garden (sunny, cloudy, stormy or dusk) reflects the validator you're delegated to: active, jailed or retired comes straight from the chain, and a reliability score layers on top when Nimiq's Validators API is reachable. Never shown as a raw number, and never shown as stormy just because a fetch failed.
- **Watering, for fun only.** One tap a day keeps a streak going and gives the garden a small glow. It never changes rewards, and the app says so everywhere watering appears.

Growth stage and plant species are not yet driven by rewards earned. Every plot currently renders as a seed. See Roadmap.

## What's verified, and what isn't

Everything here has been built against confirmed or documented behavior, never guessed. Some of it has been run on a real phone; some hasn't yet. This table is the honest summary; `docs/SPEC.md` has the dated, sourced detail behind every row.

| Area | Testnet | Mainnet |
| --- | --- | --- |
| Connect, accounts, balance | Confirmed on a real phone | Confirmed on a real phone |
| Create a stake | Confirmed on a real phone | Confirmed on a real phone (100 NIM, 2026-11-10, no fee) |
| Add to an existing stake | Confirmed on a real phone | Built, not yet sent on a real phone |
| Validator list, minimum stake, Validators API | Confirmed on a real phone | Confirmed on a real phone — reads (fee, reliability, Recommended tag) and the live minimum stake, confirmed when a 100 NIM create-staker transaction succeeded on mainnet |
| Stop earning, withdraw | Confirmed on a real phone (a real unstake and withdraw, retire then remove, 2026-11-10) | Built, **UNVERIFIED** |
| The waiting countdown, the release timing | Confirmed on testnet, 2026-11-10: release block = inactiveFrom + blocksPerEpoch matched a real wait | **UNVERIFIED** on mainnet |

"Unverified" never means "untested against expected behavior": it means built exactly to documented or confirmed rules, but not yet exercised on that specific network. See `docs/SPEC.md`'s open questions for the exact gaps and how to close them.

## Privacy

Hexgrove uses Vercel Web Analytics for anonymous visit counts. No wallet or account data is collected.

## Setup

```bash
npm install
```

## Run it locally

```bash
npm run dev -- --host
```

This starts the Vite dev server bound to all network interfaces, so a phone on the same Wi-Fi can reach it. The terminal prints a **Network** URL, for example:

```
http://192.168.1.42:5173
```

### Open it in Nimiq Pay

Two ways, both work with this dev server (`server.host` and `server.allowedHosts` are both set to `true` in `vite.config.ts`, dev only):

1. **Same Wi-Fi (LAN URL).** In Nimiq Pay, go to **Mini Apps → Custom URL**, and enter the Network URL from the terminal, e.g. `http://192.168.1.42:5173`.
2. **HTTPS tunnel.** If your phone isn't on the same network, run a tunnel (e.g. `ngrok http 5173`, or Cloudflare's `cloudflared tunnel --url http://localhost:5173`) and enter the `https://` URL it gives you into **Mini Apps → Custom URL** instead.
3. **The deployed URL.** Open **Mini Apps → Custom URL** and paste **https://hexgrove.vercel.app/**. No dev server needed.

**Confirmed:** a plain `http://` LAN Custom URL works inside Nimiq Pay (tested on an iPhone, testnet). The HTTPS tunnel option is there for when your phone isn't on the same network.

### What you should see

- Briefly, "Connecting to Nimiq Pay…".
- If Nimiq Pay is still syncing: "Nimiq Pay is still syncing" with a **Try again** button.
- Once connected: the **Hexgrove** brand mark, a **Testnet** badge (if Nimiq Pay is on testnet), your spendable balance, and the garden if you're already staked.
- If anything fails along the way (declined account access, no provider, a balance lookup error), a plain-language message and a **Try again** button, never a blank screen.

Opening the same URL in a regular desktop browser (outside Nimiq Pay) should show "Open Hexgrove in Nimiq Pay" with an **Open in Nimiq Pay** button.

## Testing on testnet

1. In Nimiq Pay, long-press the settings button for 10 seconds to open the dev menu, and switch to testnet.
2. Copy your testnet address, and get test NIM from a testnet faucet (testnet NIM has no value, and can't move to mainnet).
3. Open the app as described above, on testnet.
4. From the home screen: **Stake** (minimum 100 NIM, read live, confirmed) creates a staker; **Add stake** adds to one. A validator is picked for you, with fee, reliability and network share shown when available, but you can browse and choose any active one.
5. **Stop earning** and **Withdraw** are confirmed on testnet: a real unstake and withdraw, through the app's own flow (retire then remove, both approved in Nimiq Pay), ran on 2026-11-10. Still worth trying yourself; expect the wait to be about 12 to 24 hours depending on timing. See `docs/SPEC.md`'s open question 13, now answered.

## Testing on mainnet (create a stake confirmed, other transactions unverified)

A real phone test already confirmed the read paths: spendable balance, staker record, the live minimum stake, the validator list, and fee/reliability/Recommended data from the Validators API all showed correctly on mainnet. A real 100 NIM create-staker transaction has also been sent and confirmed on mainnet (2026-11-10, no fee). Adding to an existing stake, stop earning and withdraw have not been sent from this app on mainnet yet, so treat those as untested until you've tried them yourself.

1. Switch Nimiq Pay's own account to mainnet, then open the app as usual.
2. Check: no **Testnet** badge; your real spendable balance shows; the garden or the empty state loads without an error.
3. Open **Stake** to see the live minimum stake and the validator list load. Only go further if you're comfortable sending a real transaction.

## Mock provider (dev only)

To work on screens on a PC without a phone, add `?mock=1` to the dev server URL in a regular browser, e.g. `http://localhost:5173/?mock=1`. This stands in three fake accounts (one earning, one empty, one waiting on a release) for the real Nimiq Pay provider, and intercepts calls to the Validators API too, so every screen is reachable offline.

The mock only exists behind `import.meta.env.DEV` and is loaded with a dynamic `import()`, so it's dead-code-eliminated from `npm run build`'s output entirely, verified by grepping `dist/` for the mock's fake data after every production build; it never appears.

A **Mock data** banner is always visible at the top of the screen while the mock is active, so it can never be mistaken for real behavior.

Add `&fail=` to simulate a specific failure, at any point a Nimiq Pay approval can happen (connecting, staking, stopping, or withdrawing):

| `fail` value | Simulates |
| --- | --- |
| `notinpay` | Running outside Nimiq Pay: the provider never injects |
| `timeout` | A slow provider: it injects after the connect timeout, so the first attempt fails but a retry succeeds |
| `syncing` | Nimiq Pay reports it's still syncing once, then ready |
| `declined` | The initial account request is declined |
| `stakeDeclined` | A staking approval is declined |
| `stakeNotSent` | A staking approval fails before reaching the network |
| `stakeNetworkDown` | A staking approval fails to reach the network |
| `stakeMaybeSent` | A staking approval's outcome is unknown, never a plain retry |
| `stakeBlocked` | A staking approval is refused because another transaction is still pending |
| `stakeTimedOut` | Nimiq Pay doesn't answer a staking approval in time |
| `stakeNoAnswer` | The approval sheet is swiped away mid-request; treated the same as timed out |

Example: `http://localhost:5173/?mock=1&fail=declined`. These apply to every staking-related call: create, add, stop earning, retire and remove, not just the first stake.

Add `&nostake=1` to make every mock address report no staker, so the create-staker flow is reachable (the default mock dataset is already staked). Add `&wait=before`, `&wait=locked` (the default), `&wait=ready` or `&wait=stuck` to pick which phase of the unstaking wait is simulated, so the countdown, the Withdraw button and a stuck second approval are all independently testable. Combine freely, e.g. `http://localhost:5173/?mock=1&wait=ready&fail=stakeDeclined`.

The mock's staker records are stateful: a successful staking call updates what a later read reports, so each sheet's confirmation step and the garden update behave the same way they would against a real node.

## Probe (dev only)

A bare diagnostic screen, reachable at `?probe=1` (e.g. `http://localhost:5173/?probe=1`), used during development to call the real Nimiq Pay provider directly on testnet and see the raw result. It was how several of the confirmed facts in `docs/SPEC.md` were first observed: which address actually holds a stake, the exact shape of an error, the exact fields `getPolicyConstants` returns. Not part of the real app, never claims anything is verified on its own, and like the mock, gated behind `import.meta.env.DEV` so it never reaches production.

## Nimiq Pay calls used

Via [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk) (see `src/nimiq/provider.ts`). **Confirmed** means run successfully on a real phone; **UNVERIFIED** means built against documented or expected behavior but not yet run there.

| Call | Used for | Status |
| --- | --- | --- |
| `init()` | Waits for Nimiq Pay to inject the provider | Confirmed |
| `listAccounts()` | Every basic account in the wallet | Confirmed |
| `getBalance(address)` | Spendable NIM | Confirmed |
| `getHostNetwork()` | Picks the RPC endpoint and the Testnet badge | Confirmed on testnet and mainnet |
| `isConsensusEstablished()` | Shows "still syncing" instead of failing | Confirmed |
| `sendNewStakerTransaction({ delegation, value })` | Creates a staker | Confirmed on testnet and mainnet |
| `sendStakeTransaction({ value })` | Adds to an existing staker | Confirmed on testnet |
| `sendSetActiveStakeTransaction({ newActiveBalance })` | Stops earning on an amount, as an absolute target | Confirmed on testnet |
| `sendRetireStakeTransaction({ retireStake })` | Withdraw step 1 | Confirmed on testnet |
| `sendRemoveStakeTransaction({ value })` | Withdraw step 2, the entire retired balance | Confirmed on testnet |
| `request({ method: 'getStakerByAddress' })` | Active, waiting and released balances | Confirmed on testnet and mainnet |
| `request({ method: 'getPolicyConstants' })` | The live minimum stake and epoch length, never hardcoded | Confirmed on testnet and mainnet: 100 NIM minimum, 43,200-block epoch (about 12 hours) on testnet |
| `request({ method: 'getActiveValidators' })` | Active, jailed and retired validators | Confirmed on testnet and mainnet |
| `NimiqProviderError` | Tells apart declined, not sent, maybe sent and more | Confirmed |

Also, not part of the SDK: Nimiq's own Validators API (`src/nimiq/validatorsApi.ts`), the same service [NimJar](https://github.com/nimiq/nimjar) uses, layering fee, a reliability score and pool size on top of the chain data above. Additive throughout: if it's unreachable, every screen falls back to chain-only data rather than breaking. Confirmed reachable (CORS allows every origin) from a desktop browser and via curl against the deployed origin, on both networks; read live on a real phone on mainnet.

All Luna/NIM conversions (`src/lib/luna.ts`) use `BigInt`, never floats.

## Test

```bash
npm run typecheck   # vue-tsc
npm test            # vitest: pure logic in src/lib and src/nimiq, plus the mock provider
npm run build       # production build
```

## Roadmap

- ~~Create a stake, add to one~~ (built, confirmed on testnet). ~~Stop earning, withdraw~~ (built, confirmed on testnet, 2026-11-10). Mainnet stop earning and withdraw are still unverified.
- ~~The garden's plot count, and sky from validator health~~ (built, derived from chain data).
- ~~Watering and streaks~~ (built, local only).
- **Rewards-based growth.** Growth stage and plant species should come from rewards actually earned, not a fixed seed stage, once reward payouts can be read and classified reliably.
- **More species.** The full plant set (common species from rewards, rare species from watering streaks) is designed in `docs/SPEC.md` but not all of it is built.
- **A small backend.** Watering history and streaks are local-only today; a backend keyed to the wallet address would sync them across devices.
- Collection, Progress, and a shareable garden card.
- A leaderboard is on the roadmap only. The data model is kept ready for it, but it isn't built.

See `docs/SPEC.md` for the full build order and every open question still to confirm.

## Credits

- [Nimiq](https://www.nimiq.com/) and the [Nimiq Developer Center](https://nimiq.dev/mini-apps) for the Mini App SDK and the Provider API reference this app is built against.
- [NimJar](https://github.com/nimiq/nimjar), Nimiq's own reference staking mini app, used throughout to confirm real SDK usage and to find the Validators API and the mainnet RPC default.
- The Validators API (`validators-api-main.je-cf9.workers.dev` and its testnet equivalent), Nimiq's own validator directory, for the fee, reliability and pool-size data layered onto the chain's own read.

MIT licensed, see [`LICENSE`](LICENSE).
