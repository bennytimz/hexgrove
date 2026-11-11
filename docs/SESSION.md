# Session handoff

Read this first. It's a snapshot for whoever (human or AI) picks this up next, so you don't have to re-derive context from scratch. Details and sourcing live in `docs/SPEC.md`; day-to-day usage lives in `README.md`. This file is the summary and the pointer, not a third source of truth — if it conflicts with those, they win.

## 1. What this is

Hexgrove is a Nimiq Pay mini app for the **Earn** category of the **Nimiq Mini Apps Competition, Cycle 3**. Staking NIM grows a garden of hexagonal plots, derived from real chain data. Vue 3 + Vite + TypeScript, single-page app, no SSR.

- Live: https://hexgrove.vercel.app
- Repo: https://github.com/bennytimz/hexgrove (MIT)

## 2. Status

**Submitted** as PR #331 to the competition repository. Deadline: 2026-11-11 23:59 UTC.

Two hard constraints from here on:
- **Don't change the submission folder** (whatever PR #331 touched in the competition repo), except for text-only updates. PR #331 was merged on 2026-11-11. On 2026-11-11 the folder's text was updated via follow-up PR #351 (from the `bennytimz` fork, branch `update-hexgrove-nov11`): description, builder story and README only. Any future change there must also be text-only (`description`, `builder_story`, `README.md`), with no image, folder, `github_login`, category or schema changes, and must pass the repo's own validator (`node scripts/validate.mjs structural`).
- **Don't break the live app.** Judges and random evaluators will open `hexgrove.vercel.app` after the deadline.

## 3. What's verified, by network

| Area | Testnet | Mainnet |
| --- | --- | --- |
| Connect, accounts, balance | Confirmed | Confirmed |
| Create a stake | Confirmed | Confirmed (2026-11-10) |
| Add to an existing stake | Confirmed | Confirmed (2026-11-11) |
| Validator list, minimum stake, Validators API | Confirmed | Confirmed |
| Stop earning | Confirmed | Confirmed (2026-11-11) |
| Withdraw (retire + remove) | Confirmed (2026-11-10) | Confirmed (2026-11-11) |

Both networks are verified end to end, including the full withdraw cycle. On mainnet, stop earning ran around 2026-11-10 23:55 Lagos time, and withdraw (retire then remove, through the app) returned the 100 NIM to Spendable on 2026-11-11, about 17:55 Lagos.

## 4. Architecture, key files

- `src/nimiq/provider.ts` — thin wrapper around `@nimiq/mini-app-sdk`'s `init`/`getHostNetwork`, picks the RPC URL for the active network.
- `src/nimiq/staker.ts` — combined staker state across every `listAccounts` address; shared by the home screen and the stake sheet so both read chain state the same way.
- `src/nimiq/validatorsApi.ts` — Nimiq's own validator directory (fee, payout type, reliability score, Recommended tag), additive on top of chain-RPC data; falls back cleanly if unreachable.
- `src/nimiq/policy.ts` — live `getPolicyConstants` (minimum stake, epoch length), never hardcoded.
- `src/lib/luna.ts` — all Luna↔NIM conversions, `BigInt` only, never floats.
- `src/lib/yield.ts` — estimated (never guaranteed) staking reward rate, Staking Rewards' Nimiq methodology, cross-checked against real mainnet data.
- `src/lib/sky.ts` — garden weather from the user's validator: chain-RPC health first, reliability score layered on top when available.
- `src/lib/plots.ts` — stake amount → number of hex plots, from the spec's tier table.
- `src/lib/waiting.ts` — describes the unstaking wait (`inactiveFrom` + `blocksPerEpoch`), in plain language, no jargon.
- `src/lib/txOutcome.ts` — the six approval outcomes (declined, not sent, network down, maybe sent, blocked, timed out) — never a plain retry for "maybe sent".
- `src/components/HomeScreen.vue` — the garden, Earning/Waiting/Released rows, watering.
- `src/components/StakeSheet.vue`, `StopEarningSheet.vue`, `WithdrawSheet.vue` — the three staking flows (create/add, stop earning, retire-then-remove).
- `src/components/ValidatorsSheet.vue` — read-only validator list from Stake → Validators; sends nothing. Row wording lives in `src/lib/validatorRow.ts`.

**Dev-only tools**, both gated behind `import.meta.env.DEV` and dead-code-eliminated from production builds:
- `?mock=1` — three fake accounts plus a stateful mock provider, for working on screens without a phone. `&fail=` simulates specific approval failures; `&wait=` picks an unstaking-wait phase.
- `?probe=1` — a bare diagnostic screen that calls the real provider directly and shows the raw result; how several facts in `docs/SPEC.md` were first confirmed.

**Vercel Web Analytics**: `inject()` from `@vercel/analytics`, called only in the `else` branch of the dev/mock check in `src/main.ts` — so production only, never in dev, never alongside the mock. Anonymous page-view counts only: no cookies, no wallet or account data.

## 5. Rules we follow

- Only claim a feature is verified on a network once it has actually run there on a real phone. "Built" and "verified" are different words, used precisely.
- Never promise rewards. Yield figures are always labelled "estimate, never guaranteed."
- Watering is cosmetic only, and the UI says so everywhere it appears — it never changes rewards.
- No destructive changes to `main` (no force-push, no history rewrite) without asking first.
- Small, frequent commits with clear messages.
- `npm run typecheck`, `npm test`, and `npm run build` all pass before anything is pushed.
- Never guess Nimiq provider method names or behavior — check the Provider API reference (nimiq.dev/mini-apps) and NimJar, or ask, before building on an assumption.

## 6. Open items (not yet done)

- **Rewards-based or time-staked growth.** Growth stage currently always renders as a seed; it should eventually come from rewards actually earned (or a time-staked fallback), not a fixed stage.
- **More plant species.** Designed in `docs/SPEC.md`, not all built.
- **Switch validator.** Needs testnet verification of open question 6 (does switching require stopping earning first?) before it's built. The SDK call is `sendUpdateStakerTransaction({ newDelegation, reactivateAllStake? })`. The Validators view stays read-only until then.
- **Leaderboard.** Roadmap only, explicitly a month-3 update — do not build it now.
- **"Released" row styling.** The row exists (`HomeScreen.vue`) but its visual treatment hasn't had a dedicated styling pass.
- **Label the mockup HTML as sample-only.** `docs/hexgrove-mockup.html` should carry a visible note that it's a design reference with sample data, not live output.
- **A longer Demo Day video.** The current exports in `demo/` (`hexgrove-demo.mp4`, ~93s; `hexgrove-demo-30s.mp4`, ~35s) are the competition-submission cut. Demo Day wants a separate 3 to 5 minute version.

## 7. Next steps

1. Label `docs/hexgrove-mockup.html` as sample-only.
2. Style the "Released" row.
3. Decide and scope reward-driven (or time-staked) growth as the next real feature, once the competition deadline has passed.

## Changelog

Append new entries here, newest first, one line per session: date, what changed, what's still open.

- 2026-11-11 — Updated the competition submission text via follow-up PR #351 (https://github.com/nimiq/miniappscompetition-submissions/pull/351): description, builder story and README only, now saying mainnet verification is complete and describing the Validators view and Refresh. All structural and external checks pass. Future submission changes must be text-only.
- 2026-11-11 — Mainnet withdraw confirmed (100 NIM back to Spendable, about 17:55 Lagos, retire then remove through the app). Recorded in README, SPEC and this file; the full staking lifecycle is now verified on both networks. Still open: switch validator (open question 6).
- 2026-11-11 — Merged `validators-browse` into main (fast-forward to 3750aec) and pushed, with the Spendable/Refresh line and Preview on its own row below. Typecheck, 179 tests and build pass on main. Mainnet withdraw and switch validator (open question 6) still open.
- 2026-11-11 — Branch `validators-browse` (not merged to main): read-only Validators view in the Stake menu, intro line at the top of How it works, always-visible Refresh on the home screen; phone test passed. Follow-ups: waiting-line full stop, one-decimal yearly rate in the list, and the testnet directory's `-1` "not scored" sentinel now read as no score instead of Stormy. Switch validator added to open items, pending open question 6.

- 2026-11-11 — Recorded mainnet add-stake and stop-earning confirmations in README/SPEC. Mainnet withdraw still pending the release wait. Created this handoff file.
