# Hexgrove build spec

Last updated: 2026-11-01

## Overview

Hexgrove is a Nimiq Pay mini app where staking NIM grows a garden of hexagonal plots, built for the Earn category of the Nimiq Mini Apps Competition, Cycle 3.

The promise on the first screen is "Stake NIM. Grow a garden." Cycle 3 runs October 14 to November 11, 2026, with $4,000 per category and $17,000 in total. Confirm the exact cutoff time on miniappscompetition.com before submitting.

The design source of truth is `hexgrove-mockup.html`: a single clickable file with every screen, state and flow, using sample data. This spec records the decisions behind it and what the real app needs.

**What makes it different.** Other Cycle 3 Earn apps already stake well. Hexgrove's identity is the garden itself, tied to real staking data, plus one idea none of the apps I found use: the chosen validator's recent reliability shows up in the garden as sky and soil.

| Scored area | Points | How Hexgrove earns it |
| --- | --- | --- |
| Functionality, reliability, usefulness | 45 | A complete staking flow with every failure handled, fast loading, clear audience, daily reason to return |
| Nimiq Pay and Nimiq integration | 25 | Native provider: accounts, signing, the six staking calls, real chain data |
| Real usage | 15 | Early testers, a shareable garden card, a live app that stays up |
| Design and UX | 10 | Minimal Nimiq-style hex garden, clear text labels, polished states |
| Builder promotion checklist | 5 | Public social post and the rest of the checklist (confirm its items) |

## Locked product decisions

These choices were made during design and stay unless testing proves them wrong.

| Area | Decision |
| --- | --- |
| Category | Earn. Save is a separate category and is not entered |
| Name | Hexgrove |
| Core idea | A garden of many hex plots that grows as a NIM stake earns rewards |
| Visual style | Minimal and clean, Nimiq-style: dark navy background, gold accent (#F6B221), hexagon motif |
| What drives the garden | Amount staked sets the number of plots; rewards earned set each plant's growth stage; the watering streak sets glow only |
| Watering | One tap per day, visual only. It never changes rewards, and the UI says so |
| Missed day | Plants dim and the streak resets. Unlocked plants stay unlocked forever |
| Plants | A seeded mix per user (seed from the wallet address) so the garden is the same on every device |
| Unlocks | Common plants unlock from rewards earned; rare plants unlock from watering streaks |
| Validator conditions | The chosen validator's recent reliability shows as the garden's sky and soil: sunny, cloudy, stormy, or dusk when data is missing |
| Validator choice | Users browse and choose. A Recommended tag is only a hint, with published criteria, and several pools can carry it |
| Onboarding | A short, skippable 3-card intro shown once, then staking |
| Unstaking | Users choose the amount to stop earning, with quick amounts of 25%, 50%, 75% and 100% |
| Share card | The user chooses what it shows. Amounts are off by default. It can show a "watered today" badge |
| Sound | Soft ambient loop plus short chimes, an always-visible mute, audio starts only after the first tap |
| Leaderboard | None for now. Keep the data model ready so it can be added on the roadmap |
| Left out on purpose | XP, tiers, skins, quests and invite codes. Other Earn apps already use them, and they would blur Hexgrove's identity |
| Stack | Vue 3 with Vite, SVG with CSS animation, local-first data with a small backend sync |

## Stack and architecture

Hexgrove is a Vue 3 and Vite single-page app that draws the garden as SVG, reads chain data directly, and uses a small backend only for watering history and preferences.

```mermaid
flowchart LR
  Pay["Nimiq Pay<br/>injected provider, approval dialogs"] <-->|provider calls| App["Hexgrove mini app<br/>Vue 3 and Vite, SVG garden, local-first"]
  App -->|reads| Chain["Public chain data<br/>staker record, payouts, Validators API"]
  App <-->|sync| Backend["Small backend<br/>garden state by wallet, watering log, streaks"]
  App <-->|works offline| Local["Local storage<br/>cache and pending intent, preferences, intro seen"]
```

**Stack choices**

- Vue 3 with Vite and no server-side rendering. Nimiq's mini app docs include Vue examples, and [Kickback](https://github.com/shrooms08/kickback) is a Vue 3 and Vite app.
- The garden is SVG with CSS animation. Hexagons and geometric plants are natural SVG shapes, stay crisp on any phone, and are small.
- Data is local-first, synced to a small backend keyed to the wallet address.
- Sound uses the Web Audio API and starts only after the first tap.
- The repository is public under the MIT license, as the competition requires.

## Nimiq integration

Hexgrove talks to Nimiq Pay through its injected provider for anything the user must approve, and reads everything else from public chain data.

The method names below come from the Kickback and NimJar reference apps. Check each signature in the Provider API reference on [nimiq.dev/mini-apps](https://nimiq.dev/mini-apps) before coding.

| Provider call | Used for |
| --- | --- |
| `listAccounts` | Pick the account. Basic accounts only, no contracts |
| `getBalance(address)` | Available NIM for the amount screen |
| `sign` | Prove wallet ownership to the backend with a signed message |
| `sendNewStakerTransaction` | First stake |
| `sendStakeTransaction` | Add to an existing stake |
| `sendSetActiveStakeTransaction` | Stop earning on an amount, or reactivate |
| `sendUpdateStakerTransaction` | Switch to another validator |
| `sendRetireStakeTransaction` | Withdraw step 1: release stopped stake |
| `sendRemoveStakeTransaction` | Withdraw step 2: send NIM back to the wallet |
| `getHostNetwork()` | Mainnet or testnet, read once at startup |
| `isConsensusEstablished()` | Show "Nimiq Pay is still syncing" instead of failing |
| `NimiqProviderError` | Tell apart: declined by the user, not sent, maybe sent |

The provider only exists inside Nimiq Pay. Outside it, show "Open Hexgrove in Nimiq Pay" with a deeplink button (`nimiqpay://miniapp?url=<your url>`), never a blank screen.

**Read from public data, not app memory**

- Stake state: the staker record for the address (`getStakerByAddress` over public RPC). The app derives the lifecycle step from it on every open.
- Reward history: transactions to the address, classified as pool payouts. [NimBooks](https://github.com/subimpact/nimbooks) classifies them in `chain.ts`; [Kickback](https://github.com/shrooms08/kickback) reads each pool's payout rhythm.
- Validators: the Validators API gives the pool list, fees and reliability scores. Cache it for about 10 minutes.

**Reference apps to read first.** [NimJar](https://github.com/nimiq/nimjar) is Nimiq's own staking mini app with a full stake-to-withdraw round trip. Its `public/app.js`, `src/chain.js` and `scripts/` show the calls in use.

## Core rules

Four signals drive the garden, and each has exactly one job: amount sets plots, rewards set growth, watering sets glow, and the validator sets sky and soil. All numbers below are placeholders to tune against real balances and rewards.

**Plots from active stake.** Tiers follow honeycomb layouts so the garden always looks deliberate.

| Active stake (NIM) | Plots |
| --- | --- |
| Minimum stake | 1 |
| 5,000 | 3 |
| 25,000 | 7 |
| 100,000 | 12 |
| 400,000 | 19 |

When part of a stake stops earning, plots beyond what the active stake supports go dormant (greyed out), never deleted. Re-staking brings them back.

**Growth stage from rewards.** Measure cumulative rewards as a percentage of the staked amount, so small and large stakers progress fairly. Plants advance one after another (each later plant needs 0.35 percentage points more), so the garden changes often.

| Stage | Reached when |
| --- | --- |
| Seed | Staked, no reward yet |
| Sprout | First reward arrives |
| Leafy | 0.5% of stake |
| Flourishing | 2% of stake |
| Mature | 5% of stake |

**Plant unlocks.** Species are assigned per plot by a seeded random roll from the wallet address, drawn only from unlocked species. Unlocks use the best value ever reached, so a streak reset never re-locks a plant.

| Plant | Rarity | Unlocks when |
| --- | --- | --- |
| Daisy | Common | First reward |
| Glow fern | Common | 1% of stake earned |
| Sprig tree | Common | 5% of stake earned |
| Dusk tulip | Rare | 7-day watering streak |
| Moon lotus | Rare | 14-day watering streak |
| Hexbloom | Rare | 30-day watering streak |

**Validator conditions.** Map the pool's reliability score from the Validators API to the sky and soil. Add a buffer so a pool near a boundary does not flicker, for example by requiring two consecutive reads before changing state.

| State | Sample rule | Meaning |
| --- | --- | --- |
| Sunny | Score 85 or higher | Reliable recently |
| Cloudy | Score 60 to 84 | Worth a second look |
| Stormy | Score below 60 | Reliability dropped, compare pools |
| Dusk | No data, or fetch failed | Neutral. Never shown as stormy because of a failed fetch |

Conditions describe recent reliability. They never promise rewards, and the UI says so.

**Recommended tag (a hint only).** A pool gets it when it is sunny, charges 6% or less, pays rewards directly to the wallet, and holds under 10% of the network. Publish these criteria in the app. Several pools can carry the tag.

**Watering and streaks.** One tap per day. The day boundary is the user's local midnight, and the app stores the user's timezone. A missed day dims the plants and resets the streak to zero. Watering is visual only and must never change or imply a change to rewards.

## Staking lifecycle

Your NIM moves through six states, and the app derives the current one from chain data every time it opens, so any step can be resumed after a restart.

```mermaid
flowchart TD
  A["Available NIM<br/>in your wallet"] -->|"Stake an amount (first stake or add more)"| B["Earning<br/>plots and plants grow"]
  B -->|"Stop earning on part or all of it"| C["Waiting<br/>takes 12 hours to a few days"]
  C -->|"Reactivate while waiting"| B
  C -->|"The wait ends"| D["Ready to withdraw<br/>the wait is over"]
  D -->|"Release (approval 1 of 2)"| E["Released<br/>one approval left"]
  E -->|"Withdraw (approval 2 of 2)"| F["Back in your wallet<br/>the NIM is yours again"]
```

Stopping part of a stake leaves the rest earning, so Earning and Waiting can exist at the same time. Reactivating undoes a stop while that amount is still waiting. If the second withdraw approval fails, the stake stays Released and the app offers Finish withdrawing.

**Rules**

- Quick amounts for stopping are 25%, 50%, 75% and 100% of the earning amount, and users can type any amount.
- After a partial stop, either at least the minimum stake keeps earning or the whole stake stops. The sample minimum is 100 NIM, pending open question 4.
- Plots follow the earning stake. Plots it no longer supports go dormant (greyed out), not deleted.
- Every transaction in this lifecycle uses the five outcomes in Errors and copy.
- Offer only Withdraw once the wait is over until open question 2 confirms whether reactivating is still possible.

## Screens and states

The app has four tabs (Garden, Stake, Collection, Progress) plus an intro, and every screen must handle loading, empty and failed data, not only the happy path. Open `hexgrove-mockup.html` and use "Change demo state" to see each state below.

| Screen | What it shows | States to build |
| --- | --- | --- |
| Intro (3 cards) | The promise, the four signals, the honest basics (rewards vary, stopping takes time, weather is a signal) | First run only, skippable, swipe or buttons, ends at the validator list |
| Garden (home) | Streak and watering chip, sky with condition label, hex plots, Staked (largest), Earned, Next reward estimate, main action | First run, earning (needs water, watered), cloudy or stormy banner, no data (dusk), partly stopped, fully stopped (resting), ready to withdraw, cached data with offline chip |
| Validators | Pool rows with a soil sample, condition label, fee, estimated yield and payout type; filter Paid to wallet or All pools; sort Recommended, Reliability, Lowest fee | Loading skeleton, saved list, can't load with retry, pool not accepting stake (disabled), pool with no data, detail sheet, Recommended criteria sheet |
| Amount | Chosen pool, amount field, Available balance, 25%, 50% and Max, plots preview with next tier, labelled yield estimate | Empty, below minimum, above balance, more than 5 decimals, adding to an existing pool, review sheet |
| Approval (sheet) | Waiting for approval in Nimiq Pay, locked so it cannot be dismissed | Confirmed, declined, not sent, network down, maybe sent (see Errors and copy) |
| Your stake | Pool and status chip, amounts earning, waiting and ready, the three-step list, main action | Earning, part stopped, fully stopped waiting, ready to withdraw, released but not withdrawn, loading, can't load |
| Stop earning (sheet) | Amount field, 25% 50% 75% 100% buttons, what keeps earning and how many plots remain | Empty, above earning amount, remainder below minimum (stop all or smaller) |
| Collection | Six plants in Common and Rare, locked ones as silhouettes with the unlock condition and progress; tap for the five growth stages | Locked, unlocked, count of unlocked |
| Progress | Rewards earned, payouts, best streak, mature plants; 7 or 30 day rewards chart (tap a day); recent payouts; 7-day watering row; next unlock | First run empty, loading, can't load, rewards paused while stopped |
| Share (sheet) | A card the user composes: plots, streak, rewards, amount staked, watered badge | Amounts off by default |

**Layout rules that carry across screens**

- Bottom tab bar is sticky. Sticky action footers sit directly above it.
- The Staked amount is the largest number on the home stats row (about 23px against 17px), and shrinks for 7 or more characters so nothing clips on a 320px phone.
- Never show a blank screen. Show cached data with a "last updated" label, a skeleton while loading, or a clear message with a retry.
- Gardens show only owned plots. Do not tease locked plots, which would push people to stake more.

## Errors and copy

Every action that needs Nimiq Pay approval ends in one of six outcomes, and each has fixed wording and one next action. Reliability and error handling carry most of the 45 functionality points, so build these before polish.

| Outcome | Title | Message | Next action |
| --- | --- | --- | --- |
| Declined | No problem | You declined the request in Nimiq Pay, so nothing was sent. | Back |
| Not sent | Couldn't send your stake | Something went wrong before the request reached the network. Nothing was sent. | Try again |
| Network down | Can't reach the network | Check your connection. Nothing has been sent. | Try again |
| Maybe sent | We couldn't confirm yet | Your stake may or may not have gone through. Check your Nimiq Pay history before trying again, so you don't stake twice. | Check again, or Back to garden. Never a plain retry |
| Withdraw step 2 fails | Almost done | Your stake is released, but the withdrawal didn't go through. Your NIM is safe. Finish when you're ready. | Finish withdrawing |
| Blocked by a pending transaction | One at a time | Nimiq Pay is still finishing your last request. Wait a moment, then try again. | Try again |

Use the same pattern for stake, stop earning, reactivate and withdraw, replacing "stake" with the right noun.

**Flow rules**

- While waiting for approval, disable the button, lock the sheet, and save the pending intent locally so a restart can recover it.
- For "maybe sent", poll the chain for the transaction or the updated stake for about 30 seconds before showing the unconfirmed message.
- Detect "blocked by a pending transaction" as a `NimiqProviderError` of type `INTERNAL_ERROR`, code -32603, whose message mentions a pending transaction (seen on testnet, 2026-11-09, see Testnet observations below). Show the fixed copy above, never the raw message.
- Do all money math in integer Luna. NIM has up to 5 decimal places.
- Derive the lifecycle step from chain state every time the app opens, never from local memory.

**Startup failures**

- Not inside Nimiq Pay: "Open Hexgrove in Nimiq Pay" with a deeplink button.
- Provider slow: skeleton, then a timeout message with retry.
- Consensus not established: "Nimiq Pay is still syncing" with retry.
- Wrong or unexpected network: say which network the app is on. Show a testnet badge on testnet.
- Account access declined: explain why it is needed and offer retry.
- Sign-in or backend down: keep working with local data and show a quiet "sync paused" chip.

**Copy rules**

- Sentence case, short sentences, plain words, no raw error text, and no em dashes.
- Every message has a next action. Declines are neutral, because the user did nothing wrong.
- Never promise rewards. Yield figures are labelled as estimates, and conditions say they "don't guarantee rewards".
- Watering copy always says it does not change rewards.
- If data fails to load, show the last known data with a "last updated" label. Never show a stormy sky because a fetch failed.

## Data model and persistence

Most of the garden is derived from chain data and stores nothing; only the watering history and a few preferences need saving. Keep a local copy so the app opens instantly and works offline, and sync it to a small backend keyed to the wallet address.

| Data | Source | Stored |
| --- | --- | --- |
| Staked, earning, waiting and ready amounts, pool, lifecycle step | Staker record on chain | No. Re-read on every open |
| Reward history and payouts | Chain transactions classified as pool payouts | No. Cache per address with a timestamp |
| Available balance | `getBalance` | No |
| Plots, growth stages, species per plot, conditions state | Computed from the above and the wallet-address seed | No |
| Validator list, fees, reliability scores | Validators API | Cached about 10 minutes, plus a last-saved snapshot for offline |
| Watering log, timezone, current streak, best streak | The user's taps | Yes: local first, synced to the backend |
| Best rewards percentage reached | Highest value seen | Yes, so unlocked plants never re-lock |
| Unlocked species | Derived from the two best values above | Yes, so they never re-lock |
| Share-card choices, mute setting, intro seen | The user | Yes, local |
| Pending transaction intent | Created when approval is requested | Yes, local, until confirmed or failed |

**Backend**

- Identity is the wallet address. Prove ownership with a `sign` call on a short message, and re-verify on writes.
- Two operations are enough to start: read the garden state for an address, and write the watering log and preferences.
- If the backend is down, the app keeps working locally and shows a quiet "sync paused" chip.
- Store nothing sensitive. No keys, no emails. Amounts stay private unless the user chooses to show them on a share card.
- Keep streak and wallet data in a shape that lets an opt-in leaderboard be added later without migrating.

**Day boundary.** A watering day runs from the user's local midnight. Store the timezone with each watering entry. If the user travels, use the timezone from the last watering so a streak is not broken unfairly.

## Design, accessibility and performance

The app is dark by design, so every color below was checked for contrast on the dark surfaces, and no meaning relies on color alone.

| Token | Value | Use |
| --- | --- | --- |
| Night | #0B1230 | App background |
| Deep | #121B40 | Sheets and raised areas |
| Line | #25315E | Dividers only |
| Edge | #6573AA | Borders of controls, radios, inputs (3:1 or better) |
| Gold | #F6B221 | Primary action, selected state |
| Gold soft | #FFD36B | Secondary highlights |
| Mist | #AEB9DD | Secondary text (about 9:1 on Night) |
| Text | #F3F5FF | Primary text |

Type uses a rounded system stack (ui-rounded, SF Pro Rounded, Nunito, Avenir Next, system-ui). Primary buttons are 56px tall pills. The Staked amount is about 23px, other stats about 17px.

**Accessibility**

- Every tap target is at least 44px.
- Conditions, plant stages and states always carry a text label as well as color.
- Visible focus rings on every control. Radios use a real radio group, and amount errors use an alert region.
- Respect reduced motion: turn off the rain, drift, rays, pulse and intro animations.
- While a sheet is open, make the page behind it inert so keyboard and screen reader users stay inside it.
- Chart bars and plots have text equivalents, and the chart caption names the selected day.

**Performance** (many Nimiq Pay users will be on low-end Android phones)

- Render the garden as SVG, not canvas. Animate only transform and opacity, and avoid heavy blur.
- Load audio only after the first tap, and keep the mute button always visible.
- Show cached data first and refresh in the background.
- Keep the first-load bundle small. Test on a low-end Android phone inside Nimiq Pay, not only in a desktop browser.

## Open questions to verify on testnet

Nine things are still unconfirmed, and the first four change screens, so settle them before building the staking flow. Where a question can be answered by testing, test it with two different amounts. Two questions are already answered, below the table.

| # | Question | Why it matters | Where to look |
| --- | --- | --- | --- |
| 1 | Do the provider's staking calls accept an amount, so users can stop earning on part of a stake? | The partial stop-earning design depends on it | Provider API reference on nimiq.dev/mini-apps; `public/app.js` in [NimJar](https://github.com/nimiq/nimjar); `src/services/nimiq.ts` in [Kickback](https://github.com/shrooms08/kickback). Node tooling ([arpl](https://github.com/sisou/arpl)) takes an optional amount, which is a good sign |
| 2 | Can a stake be reactivated after the wait is over? | Decides whether Ready to withdraw offers only Withdraw | Staking contract in [core-rs-albatross](https://github.com/nimiq/core-rs-albatross); testnet |
| 3 | How long is the unstaking wait, and can the remaining time be read from chain data? | The countdown on Your stake. [Nimiq's staking page](https://www.nimiq.com/staking/) says 12 hours to 4 days | Staker record on testnet |
| 5 | Does withdrawing take exactly two approvals (retire, then remove)? | The Step 1 of 2 and Step 2 of 2 screens | NimJar scripts; testnet |
| 6 | Does switching validators require stopping earning first? | The switch flow copy | arpl describes deactivating as the step for moving to another validator; confirm on testnet |
| 7 | How do you tell pool payouts from ordinary incoming transfers? | A misclassified transfer would inflate plant growth and break the honesty rule | `chain.ts` in [NimBooks](https://github.com/subimpact/nimbooks); the payout files in Kickback |
| 8 | Do direct-payout pools and the 12-hour payout cadence exist on testnet? | Reward reading may only be testable on mainnet with a small stake | Testnet validator list; NimJar ran steps on mainnet |
| 9 | What do real reliability scores look like across pools? | The sunny, cloudy and stormy cutoffs | Validators API data |
| 10 | Exact submission cutoff time, promotion checklist items, and how later submissions count for real usage | Scoring and planning | miniappscompetition.com rules and the community forum |

**Answered**

| # | Question | Answer |
| --- | --- | --- |
| 4 | What is the real minimum stake, 100 NIM or 1000 NIM? | 100 NIM. Confirmed on testnet, 2026-11-09: `getPolicyConstants` reports `minimumStake: 10000000` Luna (100 NIM). A 50 NIM Create Staker transaction never confirmed and expired after about 2 hours; a 100 NIM Create Staker transaction confirmed within minutes |
| 11 | Does Nimiq Pay accept plain http custom URLs, or only HTTPS? | Yes. Confirmed on an iPhone, Nimiq Pay testnet, 2026-11-09: a plain `http://` LAN Custom URL (`npm run dev -- --host`) loaded Hexgrove inside Nimiq Pay. `listAccounts`, `getBalance` and `getHostNetwork` also confirmed working against testnet in the same session |

**Testnet observations, 2026-11-09**

Recorded as seen, not as verified. None of these answer a numbered question above on their own, except where noted.

- Open question 4 (now answered above): `getPolicyConstants` on testnet reports `minimumStake: 10000000` Luna (100 NIM), read from chain.
- Nimiq Pay refuses a new transaction while one is already pending: `NimiqProviderError` type `INTERNAL_ERROR`, code -32603, message "A transaction is still pending. Wait for it to resolve before sending another." Added as a sixth outcome in Errors and copy, above.
- A 50 NIM Create Staker transaction returned `TRANSACTION_OUTCOME_UNKNOWN` (code -32001) and stayed Pending in Nimiq Pay for 20+ minutes with no staker record appearing on chain, then never confirmed and expired after about 2 hours (see question 4's answer above). Nimiq Pay also showed "Network consensus lost. Syncing with network." during this time. Cause of the non-confirmation is not confirmed.
- The confirmed 100 NIM stake is recorded under `NQ59 RXSD TCJK HGLU X2RB 74EU AP1S UE70 BL1Q`, not under `NQ41 BAFA...UA5P` (the account that held the NIM before staking). The raw `getStakerByAddress` response for the NQ59 address: `balance 10000000`, `delegation NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S`, `inactiveBalance 0`, `inactiveFrom null`, `retiredBalance 0`. The reason for the separate address is unconfirmed.
- A plausible explanation, not yet checked: NimJar's `src/chain.js` documents Nimiq Pay sweeping NIM above a small threshold into an HTLC it controls within seconds of it arriving, and paying for staking from that HTLC rather than the plain address. This is documented only by NimJar's own testing notes; neither the Provider API reference nor the Mini Apps docs on nimiq.dev mention this behavior, so it is not an official guarantee. The probe's new "Check account types" button (`getAccountByAddress`) can check whether NQ59 is actually an HTLC, observed on one testnet account only; no result recorded yet.
- Open question 9: the testnet validator list (`getActiveValidators`) returns `address`, `balance`, `numStakers` and health flags only, no fee or reliability score. That question needs another data source.
- Chain policy facts read from `getPolicyConstants` on testnet: 1-second blocks, a batch is 60 blocks, an epoch is 43,200 blocks (12 hours), the transaction validity window is 7,200 blocks.

## Test plan

Test on Nimiq's proof-of-stake testnet (`test-albatross`) inside Nimiq Pay on a real phone, then confirm reward reading with a small mainnet stake. Testnet NIM has no value and cannot move to mainnet.

**Setup**

1. In Nimiq Pay, [long-press the settings button for 10 seconds](https://github.com/OkeyAmy/kolo) to open the dev menu and switch to testnet.
2. Copy your testnet address from Nimiq Pay.
3. Get test NIM from the Testnet Nimiq Wallet, or POST your address to the faucet at faucet.pos.nimiq-testnet.com/tapit, as described in the [core-rs-albatross README](https://github.com/nimiq/core-rs-albatross). Confirm both are still live.
4. Serve the app so the phone can reach it: a dev server on the same Wi-Fi (`npm run dev -- --host`), or an HTTPS tunnel or deployed link.
5. In Nimiq Pay, open Mini Apps, choose Custom URL, and enter the address.

**Test matrix**

- First stake, adding stake, the minimum amount, the maximum amount, and a brand-new empty wallet.
- Decline at every Nimiq Pay approval dialog.
- Kill the app mid-transaction and reopen it. The pending state must recover.
- Airplane mode at each step, plus a validator that disappears or stops accepting stake.
- Two accounts in one wallet.
- The full lifecycle: stop earning on part of a stake, undo it, stop again, wait, withdraw. Also stop everything.
- Withdraw step 2 failing after step 1 succeeded.
- A fresh install on a second device, to confirm the garden is identical (same plants from the wallet seed) and the streak syncs.
- Phone widths of 320, 360 and 430px, a low-end Android phone, reduced motion on, and sound on with the phone not on silent.
- A garden at each plot tier: 1, 3, 7, 12 and 19.

## Competitive notes

No public Cycle 3 entry I found uses a garden or plant metaphor, but several overlap with parts of Hexgrove, so the staking flow has to match theirs and the garden has to carry the identity. This list comes from public GitHub repos and pull requests only, and more entries will appear before the deadline.

| App | Category | Overlap with Hexgrove | How Hexgrove differs |
| --- | --- | --- | --- |
| [Kickback](https://github.com/shrooms08/kickback) | Earn | Staking, streak, XP tiers with skins, milestones, share card, invite codes, Vue | Its core is splitting payouts. Hexgrove's core is the garden, and it skips XP, tiers and skins |
| [NimBooks](https://github.com/subimpact/nimbooks) | Earn | Stake and unstake, validator picker, balance states | Bookkeeping and tax tool, not a game |
| [NimJar](https://github.com/nimiq/nimjar) | Nimiq's own reference app | One-tap staking and step-by-step withdrawal | Probably not an entry. Judges will still know what a one-tap flow feels like |
| [Savborne](https://github.com/er4l1m4d/savborne) | Save | Daily check-in, XP, streaks, unlocks | Different category and different core loop |
| [Garura Hive](https://github.com/jakalijey/garura-hive) | Unconfirmed | Tree and honeycomb visuals | Tap-to-earn game with no staking |
| [NimStreak](https://github.com/nicedaymiracle/nimstreak), [Stakes](https://github.com/surfstyk/stakes), [NimDares](https://github.com/Saber1Y/NimDares) | Unconfirmed | Streaks and "stake" in the commitment sense | Put NIM at risk on habits. They do not stake with validators |

**What to do about it**

- Put the garden on the first screen, so the identity shows in five seconds.
- Show validator reliability as sky and soil. None of the apps above do.
- Do not copy Kickback's XP, tiers, skins, quests or invites.
- Treat reliability as the main contest. Earn judges will compare staking flows, and the 45 reliability points reward a flow with no dead ends.
- The Earn brief says the Mini Apps framework can do more than stake NIM, through EVM chains. A staking-only app fits Earn, but it is also the most common approach. EVM yield adds gas friction, so it is a later option, not a first-build goal. See the [Cycle 3 announcement](https://www.nimiq.com/blog/mini-apps-competition-cycle-3-announcement/).

## Build order and submission

Build the risky parts first: the Nimiq connection and the staking flow carry 70 of the 100 points, and the garden is only as good as the data under it. Each step ends with a gate that must pass before moving on.

1. **Scaffold and connect.** Create the Vue 3 and Vite project and open it in Nimiq Pay on testnet. Gate: it shows your testnet account and balance.
2. **Settle the open questions.** Answer questions 1 to 6 on testnet and update this spec. Gate: written answers for the amount-based stop, reactivation, wait time, minimum stake, withdraw approvals and switching.
3. **Staking flow.** Validators, amount, approval states, Your stake, partial stop earning, withdraw. Gate: the full lifecycle in the test matrix passes with no dead ends.
4. **Garden from real data.** Plots, growth stages, species and validator conditions, derived from chain data. Gate: reward reading is verified against the payout rules.
5. **Watering and backend.** Streak, unlocks, and local-first sync keyed to the wallet. Gate: a second device shows the same garden and streak.
6. **Remaining screens.** Intro, Collection, Progress, share card, sound.
7. **Polish.** Accessibility, narrow phones, low-end Android, error wording, reduced motion.
8. **Real users.** Get testers on a live HTTPS URL early, fix what they hit, and keep the app running for random evaluation after the deadline.
9. **Submit and promote.**

**Submission checklist.** Confirm each item on the [rules page](https://miniappscompetition.com/rules).

- [ ] Public GitHub repository with the MIT license
- [ ] Written description of 250 words or fewer
- [ ] Live HTTPS URL that works inside Nimiq Pay
- [ ] Submitted through the competition's process, before the exact cutoff time
- [ ] Public social post and the other promotion checklist items
- [ ] README that covers setup, the Nimiq calls used, the roadmap (including the leaderboard), and open-source credits
- [ ] Real testers have used it, and the app stays online after submission

The rules say submissions go public at the start of Week 3 for early access testing, so check how a later submission is treated for the real-usage score.
