# Uniswap v4 Privacy DeFi – ideas for Veil

Notes for the **Uniswap Foundation – Privacy DeFi** track ($5k). Track asks for privacy-enhancing financial systems: reduce information exposure, better execution, resilience to adverse selection. Hooks optional.

---

## Option A – “Private swap” path via Uniswap v4

- Add a second swap path in the extension: for selected pairs/chains where v4 is deployed, get a quote from Uniswap v4 (v4 SDK or contract read) and execute the swap on a v4 pool.
- **Privacy angle:** Document (and in video) how using v4 (e.g. specific pool type or hook, or execution flow) reduces frontrunning / information exposure compared to a plain public mempool swap, and how that fits a “privacy by default” wallet.

## Option B – One clear v4 integration + narrative

- Single, well-documented flow: e.g. “Swap via Uniswap v4” for one chain (Ethereum mainnet or the testnet where v4 is live).
- One or two tx types: swap (and optionally add liquidity) on a v4 pool.
- **Submission:** Repo + README + **TxIDs** (testnet and/or mainnet) + short demo video (≤3 min) explaining how this improves privacy or execution quality for the user.

## Option C – Hooks for privacy

- If we can deploy or use a v4 hook that enforces privacy-friendly behavior (e.g. commit–reveal, or private pool), integrate that pool in the “Private swap” flow and make the hook the center of the “Privacy DeFi” narrative.

---

## Implementation outline

1. Add **Uniswap v4** dependency (v4 SDK or ABIs + contract addresses for the target chain).
2. In `Home.tsx` / swap flow: when chain and pair support v4, optionally fetch v4 quote and show “Swap via Uniswap v4” (and gas/amount comparison if desired). On confirm, build and send the v4 swap tx.
3. Store the resulting tx hash and add it (and block explorer link) in README as proof of “functional code” and on-chain usage.

---

## Submission checklist (from track)

- Clear evidence of functional code.
- **TxID** transactions (testnet and/or mainnet).
- GitHub repository, README.md, demo link or setup instructions, and a **demo video (max 3 min)**.
