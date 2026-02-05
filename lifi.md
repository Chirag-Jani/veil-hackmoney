# LI.FI integration plan (HackMoney 2026)

Detailed plan for integrating LI.FI into Veil to compete in the LI.FI track ($6k total).

---

## Track overview

| Track | Prize | Focus |
|-------|--------|--------|
| **Best Use of LI.FI Composer in DeFi** | $2,500 | Multi-step DeFi workflows in one UX (Composer). |
| **Best AI x LI.FI Smart App** | $2,000 | AI agent that uses LI.FI for cross-chain execution. |
| **Best LI.FI-Powered DeFi Integration** | $1,500 | DeFi product/wallet integration; reliability + UX. |

**Recommendation:** Target **Composer** and/or **DeFi Integration**. Skip AI track unless adding an agent.

---

## Qualification requirements (by track)

### Composer ($2,500)

- Use LI.FI SDK or APIs for **at least one cross-chain action** (swap, bridge, or swap+bridge+contract call).
- Support **at least two EVM chains** in the user journey.
- Ship a **working frontend** (web, mobile, or wallet plugin) judges can click through.
- Submission: **Github repo** + **video demo** walking through the project.

### DeFi Integration ($1,500)

- Use LI.FI’s **core API/SDK** for cross-chain swaps/bridges or deposits.
- Integrate **at least one external DeFi protocol or wallet context** (e.g. lending, restaking, LP, on-chain fund). Veil as wallet + LI.FI counts.
- Emphasis on **reliability and UX**: slippage, errors, gas handling.
- Submission: **video demo** + **Github URL**.

### AI x LI.FI ($2,000)

- Use LI.FI **programmatically** (SDK/API or contract calls).
- **Strategy loop:** monitor state → decide → act using LI.FI.
- Minimal UI or clear CLI/script demo with logs.
- Submission: **video demo** + **Github URL**.

---

## How it fits Veil

- **Current state:** Multi-chain wallet (Ethereum, Avalanche, Arbitrum, Solana); **Swap is live** via LI.FI REST API (`/quote` + execute). Three EVM chains only; no Base. Native tokens: ETH (Ethereum, Arbitrum), AVAX (Avalanche).
- **LI.FI role:** Powers **Swap** (and bridge) across Ethereum ↔ Avalanche ↔ Arbitrum. Single-step quotes; Composer not yet used.

---

## Prize eligibility (as of now)

| Track | Prize | Eligible? | Notes |
|-------|--------|-----------|--------|
| **Best LI.FI-Powered DeFi Integration** | **$1,500** | **Yes** | Veil = wallet; LI.FI core API for cross-chain swaps/bridges; ≥1 external context (wallet); UX = slippage, errors, gas. |
| **Best Use of LI.FI Composer in DeFi** | $2,500 | No | Requires Composer (multi-step composed routes). Current implementation uses single-step `/quote`. |
| **Best AI x LI.FI Smart App** | $2,000 | No | Requires AI agent with strategy loop. |

**You are currently eligible for: Best LI.FI-Powered DeFi Integration ($1,500).** To aim for the Composer prize ($2,500), add a flow using LI.FI Composer for a multi-step route (e.g. swap + bridge in one composed journey).

---

## Implementation options (detailed)

### Option 1: Swap + Bridge (core — required for both tracks)

**Goal:** Replace “Coming soon” Swap with a real LI.FI-powered flow on **≥2 EVM chains** (e.g. Ethereum mainnet + Base or Arbitrum).

**Steps:**

1. **Add LI.FI dependency**
   - Install LI.FI SDK in `veil-hackmoney` (or use REST API). Prefer SDK if it works in extension context (browser + optional Node for tooling).

2. **Define supported EVM chains**
   - At least: **Ethereum** (1), **Base** (8453) or **Arbitrum** (42161). Use chain IDs consistent with LI.FI’s config.

3. **Quote flow**
   - User selects: source chain, source token (e.g. ETH), amount, destination chain, destination token (e.g. USDC).
   - Call LI.FI for routes (e.g. `getConnectorRoutes` or equivalent quote endpoint).
   - Display: route summary, estimated output, estimated gas, and (if applicable) bridge steps.

4. **Execution**
   - LI.FI returns transaction(s) to sign. Use existing Veil EVM signer:
     - `getEthereumWalletForIndex(password, activeBurnerIndex)` → private key.
     - Build ethers `Wallet` with provider for the correct chain (reuse pattern from `handleTransfer` for ETH).
   - Sign and send each tx in order; handle success/failure and show status in UI.

5. **UX**
   - Slippage: let user set tolerance (e.g. 0.5%, 1%, 3%) and pass to LI.FI.
   - Errors: surface message (e.g. “Insufficient liquidity”, “Slippage exceeded”) and optionally retry.
   - Gas: check user balance vs. estimated gas; show “Insufficient for gas” like in Transfer flow.

**Deliverable:** A **Swap** (or Swap + Bridge) screen/modal that works for at least two EVM chains and is demonstrable in the video.

---

### Option 2: LI.FI Composer (for $2.5k track)

**Goal:** One multi-step flow (e.g. swap + bridge in a single “composed” route) with minimal user steps.

**Steps:**

1. **Use Composer API/SDK**
   - Follow [LI.FI Composer docs](https://docs.li.fi/) for “composed” routes: one route that may include swap on chain A + bridge to chain B + optional swap on B.
   - Request a composed route (e.g. “ETH on Ethereum → USDC on Base”) and get back the list of actions/transactions.

2. **Single-sign or few-sign UX**
   - If Composer returns one meta-transaction or a batch, single approval in Veil. If multiple txs, show clear steps (“Step 1 of 2: Swap on Ethereum…”) and sign in sequence.

3. **Ensure “at least two EVM chains”**
   - Example: Ethereum → Base or Ethereum → Arbitrum. Document this in the demo.

**Deliverable:** Same Swap UI but powered by Composer where applicable; video shows one flow that crosses two EVM chains in one composed journey.

---

### Option 3: “Deposit from anywhere” into Privacy (optional, Composer story)

**Goal:** Use LI.FI to bring assets from another chain to Solana, then plug into existing “Deposit to Privacy” flow.

**Steps:**

1. **Route: any supported chain → Solana**
   - Example: User has ETH on Ethereum. LI.FI route: ETH (Ethereum) → SOL (Solana). Execute bridge/swap via LI.FI (EVM side signed by Veil; Solana side if needed — check LI.FI’s Solana support).

2. **Then existing flow**
   - Once user has SOL on Solana, use current “Deposit to Privacy” in Veil (no change to Privacy Cash logic).

3. **UX**
   - Optional entry point: “Get SOL from another chain” or “Deposit from Ethereum” that opens LI.FI flow first, then suggests “Deposit to Privacy” when SOL is available.

**Deliverable:** Document in video as “deposit from any chain into a single [privacy] strategy” to align with Composer examples.

---

## Technical checklist

- [ ] **Install LI.FI SDK** (or decide REST-only) in `veil-hackmoney`.
- [ ] **Chain config:** Map Veil’s “Ethereum” network to chainId 1; add second EVM chain (e.g. Base 8453) in UI and in LI.FI config.
- [ ] **RPC:** Use existing `getEthRPCManager()` (or equivalent) for each EVM chain; pass correct RPC to LI.FI/ethers per chain.
- [ ] **Signer:** Reuse `getEthereumWalletForIndex` + ethers `Wallet`; ensure wallet is connected to the chain that each tx targets (switch chain if needed before signing).
- [ ] **Quote:** Implement one function that takes (fromChain, fromToken, amount, toChain, toToken) and returns LI.FI route + estimate.
- [ ] **Execute:** Implement executor that takes LI.FI’s tx payload(s), signs with Veil wallet, sends in order; handle revert and show error.
- [ ] **Slippage:** Add slippage selector (e.g. 0.5 / 1 / 3%) and pass to LI.FI when requesting route or executing.
- [ ] **Balance checks:** Before execute: check balance ≥ amount + gas for the relevant chain; show “Insufficient balance” or “Insufficient for gas” as in Transfer.

---

## UI/UX checklist

- [ ] **Swap entry:** Swap button opens Swap modal/page (no longer Coming Soon).
- [ ] **Source:** Chain + token + amount (with “Max” and balance display).
- [ ] **Destination:** Chain + token; show estimated output from quote.
- [ ] **Quote:** Display route summary (e.g. “Swap on Ethereum → Bridge to Base”), gas estimate, and minimum received (with slippage).
- [ ] **Confirm:** Single “Confirm” or “Swap” that triggers sign + send; loading state during quote and during tx(s).
- [ ] **Errors:** Show user-friendly message on quote failure, tx revert, or slippage exceeded; optional “Try again” or “Adjust slippage”.
- [ ] **Success:** Show success state and optionally link to explorer(s); refresh balances (reuse existing balance check).

---

## Files to add or touch

- **New:** `src/components/SwapModal.tsx` (or `Swap.tsx` page) — UI for chain/token/amount, quote, confirm.
- **New:** `src/utils/lifi.ts` (or `lifiService.ts`) — LI.FI quote + execute helpers; chain/token constants.
- **Modify:** `src/pages/Home.tsx` — Swap button opens Swap modal instead of ComingSoonModal; pass in active wallet, network, balance, and signer/execute callback.
- **Modify:** `package.json` — Add LI.FI SDK (or keep fetch-based API client if SDK is not extension-friendly).

---

## Documentation and references

- [LI.FI Documentation](https://docs.li.fi/)
- [End-to-end transaction example](https://docs.li.fi/introduction/user-flows-and-examples/end-to-end-example)
- [API Reference](https://docs.li.fi/api-reference/introduction)
- [LI.FI SDK Overview](https://docs.li.fi/sdk/overview)

---

## Submission checklist

- [ ] Working frontend (extension popup) with at least one cross-chain flow (≥2 EVM chains).
- [ ] Github repo link in submission.
- [ ] Video demo: walk through project and show Swap (and optional “deposit from anywhere”) flow.
- [ ] If targeting Composer: video clearly shows one multi-step (e.g. swap+bridge) flow in one user journey.
- [ ] If targeting DeFi Integration: video shows slippage/error/gas handling and reliability.
