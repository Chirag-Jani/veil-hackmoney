# Veil — HackMoney Submission

**Privacy by default. Multi-chain (EVM + Solana) wallet for private transfers and burner identities.**

Veil is a privacy-focused burner wallet browser extension built for fast, disposable onchain identities. This repo is the **HackMoney** build with **LI.FI** integration for swap, bridge, and multi-step cross-chain flows.

---

## What it does

- **Create and manage burner addresses**
  - Generate multiple “Account N” burner wallets.
  - Quickly switch between burners.
  - Archive old burners to keep the wallet list clean.

- **Network switching**
  - Toggle between **Ethereum**, **Avalanche**, **Arbitrum**, and **Solana**.
  - Each network maintains its own active burner and wallet list.

- **Transfers**
  - **Ethereum / Arbitrum**: send **ETH** to any `0x…` address.
  - **Avalanche**: send **AVAX** to any `0x…` address.
  - **Solana**: send **SOL** to any Solana address.

- **Swap & bridge (EVM) — LI.FI**
  - **Same-chain**: single-step swap via LI.FI `GET /quote` (e.g. ETH → USDC on Ethereum).
  - **Cross-chain**: multi-step routes via LI.FI `POST /advanced/routes` — e.g. ETH on Ethereum → USDC on Arbitrum in one flow (swap + bridge or bridge + swap). Steps are executed in sequence; the UI shows “Step 1: … · Step 2: …” when there are multiple steps.
  - **3 EVM chains**: Ethereum, Avalanche, Arbitrum. Source/destination chain + token, amount, slippage (0.5 / 1 / 3%), gas estimate, balance checks, error handling.

- **Balance monitoring**
  - Background balance monitoring for **SOL, ETH, AVAX** (per network).

- **dApp connection (Solana + Ethereum providers)**
  - **Solana**: `window.veil` and `window.solana.providers`; connect, disconnect, message signing.
  - **Ethereum**: `window.ethereum` (if no other provider) and `window.veilEthereum`; `eth_requestAccounts`, `eth_chainId`, etc.

- **Privacy Cash (Solana-only)**
  - Deposit to privacy, withdraw from privacy, private transfer (when enabled in settings).

- **Key management**
  - Encrypted seed; export private key (EVM hex, Solana Base58/Phantom format).

---

## LI.FI integration (HackMoney track)

| Item | Status |
|------|--------|
| Swap + bridge (3 EVM chains) | Done |
| Single-step quote (`GET /quote`) | Done |
| Multi-step routes (`POST /advanced/routes`) | Done |
| Per-step transaction (`POST /advanced/stepTransaction`) | Done |
| Execute steps in sequence (bridge + swap in one flow) | Done |
| Slippage, gas estimate, error handling | Done |

**APIs used:** `GET /quote`, `POST /v1/advanced/routes`, `POST /v1/advanced/stepTransaction`.

**Eligible tracks:**
- **Best LI.FI-Powered DeFi Integration ($1,500)** — Veil as wallet; LI.FI for cross-chain swap/bridge; slippage, errors, gas handling.
- **Best Use of LI.FI Composer in DeFi ($2,500)** — Multi-step cross-chain flow in one UX (e.g. swap on chain A → bridge to chain B); working frontend; ≥2 EVM chains.

---

## Run / install (for judges)

1. **Prerequisites:** Node.js (v18+), npm or pnpm.
2. **Install:** `npm install`
3. **Build:** `npm run build`
4. **Load in browser:** Open Chrome/Edge → Extensions → “Load unpacked” → select the `dist` folder (or the extension output directory from your build).
5. **Use:** Create/unlock a wallet, switch to Ethereum/Avalanche/Arbitrum, open Swap and try same-chain or cross-chain (e.g. ETH on Ethereum → USDC on Arbitrum).

---

## Hackathon submission checklist

- [ ] **Github repo:** Public repo link submitted.
- [ ] **Video demo:** Short walkthrough covering:
  - What Veil is (burner wallet, multi-chain).
  - **LI.FI:** Open Swap, pick cross-chain (e.g. Ethereum → Arbitrum), show quote and **multi-step route** (“Step 1: … · Step 2: …” when applicable), then execute. Mention same-chain swap and slippage/gas/errors.
  - Optional: same-chain swap, transfers, or dApp connection.
- [ ] **Composer track (if targeting $2.5k):** Video clearly shows one cross-chain flow with **at least two EVM chains** and a **multi-step** journey (e.g. swap then bridge, or bridge then swap) in one flow.

---

## Tech notes

- **EVM RPCs:** `src/config/rpcs.ts` (retry across multiple RPCs per chain).
- **LI.FI:** `src/utils/lifi.ts` (quote, routes, stepTransaction); execution in `Home.tsx` (`handleSwapExecute`, `handleSwapExecuteRoute`) and `SwapModal.tsx`.
- **Chains:** Ethereum (1), Avalanche (43114), Arbitrum (42161). Solana separate.

---

## Links

- [LI.FI API](https://docs.li.fi/api-reference/introduction)
- [LI.FI Composer / multi-step](https://docs.li.fi/introduction/user-flows-and-examples/lifi-composer)
