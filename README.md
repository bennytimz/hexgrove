# Hexgrove

A Nimiq Pay mini app where staking NIM grows a garden of hex plots. Built for the Nimiq Mini Apps Competition, Cycle 3 (Earn).

"Stake NIM. Grow a garden."

See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec and [`docs/hexgrove-mockup.html`](docs/hexgrove-mockup.html) for the visual and interaction reference.

## Status

Connect screen, read-only home screen (combined stake across every account, garden of hex plots, watering, sound, sky from the validator you're delegated to), and the real staking flow: create a staker or add to one from the **Stake** / **Add stake** buttons. Stop earning and withdraw aren't built yet — the unstake wait time is still being measured on testnet.

Confirmed working on a real phone (iPhone, Nimiq Pay, testnet, 2026-11-09): the plain-http LAN Custom URL, `listAccounts`, `getBalance`, and `getHostNetwork`. The staking flow (`sendNewStakerTransaction`, `sendStakeTransaction`, and the error outcomes) is built against confirmed testnet behavior (see `docs/SPEC.md`) but not yet re-confirmed live in Nimiq Pay on a phone.

## Live URL

**https://hexgrove.vercel.app/**

Deployed on Vercel, connected to this GitHub repo: every push to `main` redeploys automatically. To open it in Nimiq Pay: **Mini Apps → Custom URL** → paste the URL above.

## Setup

```bash
npm install
```

## Run it

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
2. **HTTPS tunnel.** If your phone isn't on the same network, run a tunnel (e.g. `ngrok http 5173`, or Cloudflare's `cloudflared tunnel --url http://localhost:5173`) and enter the `https://` URL it gives you into **Mini Apps → Custom URL** instead. `allowedHosts: true` means Vite will accept requests through the tunnel's hostname.

**Confirmed:** a plain `http://` LAN Custom URL works inside Nimiq Pay (tested on an iPhone, testnet). The HTTPS tunnel option above is still there for when your phone isn't on the same network.

### What you should see

- Briefly, "Connecting to Nimiq Pay…".
- If Nimiq Pay is still syncing: "Nimiq Pay is still syncing" with a **Try again** button.
- If more than one account exists in the wallet: a list to choose one; with a single account, it's selected automatically.
- Once connected: the **Hexgrove** brand mark, a **Testnet** badge (if Nimiq Pay is on testnet), your account address, and your balance in NIM (with thousands separators, e.g. "110,000 NIM").
- If anything fails along the way (declined account access, no provider, a balance lookup error), a plain-language message and a **Try again** button — never a blank screen.

Opening the same URL in a regular desktop browser (outside Nimiq Pay) should show "Open Hexgrove in Nimiq Pay" with an **Open in Nimiq Pay** button and a **Try again** button.

## Staking flow

From the home screen, **Stake** (no stake yet) or **Add stake** (already staked) opens a sheet with an amount field and, for a new stake, a validator chooser. Approve the transaction in Nimiq Pay when prompted; the sheet polls the chain and updates the garden once the stake shows.

Testnet NIM has no value — get some from a testnet faucet first if your wallet is empty. The minimum to create a new staker is read live from the chain (confirmed as 100 NIM on testnet); adding to an existing staker has no separate minimum.

## Mock provider (dev only)

To work on screens on a PC without a phone, add `?mock=1` to the dev server URL in a regular browser, e.g. `http://localhost:5173/?mock=1`. This stands in two fake accounts (110,000 NIM and 0 NIM, network testnet) for the real Nimiq Pay provider.

The mock only exists behind `import.meta.env.DEV` and is loaded with a dynamic `import()`, so it's dead-code-eliminated from `npm run build`'s output entirely — verified by grepping `dist/` for the mock's fake data and "not mocked yet" error text after a production build; neither appears.

A **Mock data** banner is always visible at the top of the screen while the mock is active, so it can never be mistaken for real behavior.

Add `&fail=` to simulate a specific failure:

| `fail` value | Simulates |
| --- | --- |
| `notinpay` | Running outside Nimiq Pay: the provider never injects, so `init()` eventually times out |
| `timeout` | A slow provider: it injects ~11 seconds in (just past the default 10s timeout), so the first connect attempt fails but a later retry succeeds |
| `syncing` | `isConsensusEstablished()` returns false once, then true, so you can see the "still syncing" screen and the retry succeeding |
| `declined` | `listAccounts()` always rejects with a `PERMISSION_DENIED` `NimiqProviderError` |
| `stakeDeclined` | The stake sheet's approval is declined (`PERMISSION_DENIED`) |
| `stakeNotSent` | The stake sheet's approval fails before reaching the network |
| `stakeNetworkDown` | The stake sheet's approval fails with a `NETWORK_ERROR` |
| `stakeMaybeSent` | The stake sheet's approval returns `TRANSACTION_OUTCOME_UNKNOWN` — shows "Check again" / "Back to garden", never a plain retry |
| `stakeBlocked` | The stake sheet's approval is refused because another transaction is still pending |
| `stakeTimedOut` | Nimiq Pay returns "Operation timed out after 30000 milliseconds" — shows "Timed out", never an immediate retry |
| `stakeNoAnswer` | Nimiq Pay returns a `[birpc] timeout` error (e.g. the approval sheet was swiped away) — also shows "Timed out" |

Example: `http://localhost:5173/?mock=1&fail=declined`

Add `&nostake=1` to make every mock address report no staker, so the create-staker flow is reachable (the default mock dataset is pre-staked, so only the add-stake flow is reachable without it). Combine freely, e.g. `http://localhost:5173/?mock=1&nostake=1&fail=stakeDeclined` tests declining a create-staker approval.

The mock's staker records are stateful: a successful `sendNewStakerTransaction` or `sendStakeTransaction` call updates what a later `getStakerByAddress` reports, so the stake sheet's post-send confirmation poll and the garden update behave the same way they would against a real node.

## Test

```bash
npm run typecheck   # vue-tsc
npm test            # vitest: src/lib/luna.ts and the mock provider's failure modes
npm run build       # production build
```

## Nimiq calls used so far

Via [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk) (see `src/nimiq/provider.ts`):

- `init()` — waits for Nimiq Pay to inject the provider.
- `nimiq.isConsensusEstablished()` — gates the rest of the screen on network consensus.
- `nimiq.listAccounts()` — basic accounts only. **Confirmed on testnet.**
- `nimiq.getBalance(address)` — balance in Luna; feature-detected with `typeof nimiq.getBalance === 'function'` since older Nimiq Pay hosts don't expose it. **Confirmed on testnet.**
- `getHostNetwork()` — drives the testnet badge. **Confirmed on testnet.**
- `NimiqProviderError` — distinguishes a declined account request, and a failed staking approval, from other failures.
- `nimiq.sendNewStakerTransaction({ delegation, value })` — creates a staker. **Confirmed on testnet.**
- `nimiq.sendStakeTransaction({ value })` — adds to an existing staker. **Confirmed on testnet** with a 100 NIM add.
- `nimiq.request({ method: 'getStakerByAddress', params: [address] })` — reads a staker's active, waiting and released balances. **Confirmed on testnet.**
- `nimiq.request({ method: 'getPolicyConstants' })` — the live minimum stake (never hardcoded). **Confirmed on testnet:** `minimumStake: 10000000` Luna (100 NIM).
- `nimiq.request({ method: 'getActiveValidators' })` — the validator chooser's list and the home screen's sky condition.

All Luna/NIM conversions (`src/lib/luna.ts`) use `BigInt`, never floats.

## Roadmap

- ~~Create-staker and add-stake~~ — built. Partial stop earning and withdraw are next, once the unstake wait time is confirmed on testnet.
- ~~The garden: plots, growth stages, species, and validator-driven sky, derived from chain data~~ — built.
- ~~Watering and streaks~~ — built (local only; a small backend to sync across devices, keyed to the wallet address, is not built yet).
- Collection, Progress, and the share card.
- A leaderboard is on the roadmap only; the data model is kept ready for it but it isn't built.

See `docs/SPEC.md` for the full build order and the open questions still to confirm on testnet.

## Credits

- [NimJar](https://github.com/nimiq/nimjar) — Nimiq's own reference mini app; used to confirm real `@nimiq/mini-app-sdk` usage.
- [Nimiq Developer Center](https://nimiq.dev/mini-apps) — Mini App SDK and Nimiq Provider API reference.
- MIT licensed, see `LICENSE`.
