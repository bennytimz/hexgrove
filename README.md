# Hexgrove

A Nimiq Pay mini app where staking NIM grows a garden of hex plots. Built for the Nimiq Mini Apps Competition, Cycle 3 (Earn).

"Stake NIM. Grow a garden."

See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec and [`docs/hexgrove-mockup.html`](docs/hexgrove-mockup.html) for the visual and interaction reference.

## Status

Build order step 1 only: a single screen that connects to Nimiq Pay, picks an account, and shows its balance and network. No staking, no garden yet.

Confirmed working on a real phone (iPhone, Nimiq Pay, testnet, 2026-11-09): the plain-http LAN Custom URL, `listAccounts`, `getBalance`, and `getHostNetwork`.

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

## Test

```bash
npm run typecheck   # vue-tsc
npm test            # vitest, currently covers src/lib/luna.ts
npm run build       # production build
```

## Nimiq calls used so far

Via [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk) (see `src/nimiq/provider.ts`):

- `init()` — waits for Nimiq Pay to inject the provider.
- `nimiq.isConsensusEstablished()` — gates the rest of the screen on network consensus.
- `nimiq.listAccounts()` — basic accounts only. **Confirmed on testnet.**
- `nimiq.getBalance(address)` — balance in Luna; feature-detected with `typeof nimiq.getBalance === 'function'` since older Nimiq Pay hosts don't expose it. **Confirmed on testnet.**
- `getHostNetwork()` — drives the testnet badge. **Confirmed on testnet.**
- `NimiqProviderError` — distinguishes a declined account request from other failures.

All Luna/NIM conversions (`src/lib/luna.ts`) use `BigInt`, never floats.

## Roadmap

- Validators, amount, approval states, your stake, partial stop earning, withdraw (the staking flow).
- The garden itself: plots, growth stages, species, and validator-driven sky/soil, derived from chain data.
- Watering, streaks, and local-first sync to a small backend keyed to the wallet address.
- Collection, Progress, and the share card.
- A leaderboard is on the roadmap only; the data model is kept ready for it but it isn't built.

See `docs/SPEC.md` for the full build order and the open questions still to confirm on testnet.

## Credits

- [NimJar](https://github.com/nimiq/nimjar) — Nimiq's own reference mini app; used to confirm real `@nimiq/mini-app-sdk` usage.
- [Nimiq Developer Center](https://nimiq.dev/mini-apps) — Mini App SDK and Nimiq Provider API reference.
- MIT licensed, see `LICENSE`.
