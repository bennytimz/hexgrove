# Hexgrove

Hexgrove is a Nimiq Pay mini app for the Earn category of the Nimiq Mini Apps Competition, Cycle 3. Staking NIM grows a garden of hexagonal plots. The first-screen promise is "Stake NIM. Grow a garden."

## Source of truth

- `docs/SPEC.md` holds every decision, rule, screen state, error message and open question. Read it before changing anything.
- `docs/hexgrove-mockup.html` is the visual and interaction reference. It is one file with sample data. Port the design and behavior, not its code structure.
- If the spec and the mockup disagree, ask me which one is right.

## Stack

- Vue 3 with Vite, single-page app, no server-side rendering. TypeScript preferred.
- The garden is SVG with CSS animation. No canvas.
- Local-first data, synced to a small backend keyed to the wallet address. Prove ownership with a signed message.
- Sound uses the Web Audio API and starts only after the first user tap.
- Public repo, MIT license.

## Nimiq rules

- Never guess provider method names or signatures. Check the Provider API reference at nimiq.dev/mini-apps and the official NimJar repo (github.com/nimiq/nimjar) first. If still unsure, stop and ask me.
- The provider only exists inside Nimiq Pay. Outside it, show "Open Hexgrove in Nimiq Pay" with a deeplink button. Never show a blank screen.
- Read stake state and payouts from public chain data. Derive the lifecycle step from chain state every time the app opens.
- All money math uses integers (Luna). NIM has up to 5 decimals. Never use floats for balances.
- The "Open questions to verify on testnet" section of the spec lists things that are unconfirmed. Do not build on an unconfirmed answer. Record each answer in the spec once I confirm it.
- Develop against the Nimiq testnet (`test-albatross`) and show a testnet badge on testnet.

## Quality rules

- Every async action has loading, empty and error states. Use the five outcomes in the spec's "Errors and copy" section: declined, not sent, network down, maybe sent, and withdraw step 2 failed. Never offer a plain retry for "maybe sent".
- Copy: sentence case, short sentences, no em dashes, no raw error text. Never promise rewards. Label yield figures as estimates. Watering never changes rewards, and the UI says so.
- Accessibility: tap targets at least 44px, a text label alongside every color-coded state, visible focus rings, and respect reduced motion.
- Performance: animate only transform and opacity, keep the bundle small, load audio lazily. Many users are on low-end Android phones.
- Do not add XP, tiers, skins, quests, invite codes or a leaderboard. The leaderboard is roadmap only.

## How to work

- Work in small steps that follow the "Build order" in the spec. Finish one step, tell me exactly how to test it, then stop and wait.
- You cannot run the app inside Nimiq Pay. Never say a Nimiq Pay behavior is verified until I confirm it on my phone.
- Commit often with clear messages. Keep the README current: setup, the Nimiq calls used, the roadmap (including the leaderboard), and credits.
- Run the dev server so a phone can reach it: `npm run dev -- --host`. (Update this section with the real commands after scaffolding.)
