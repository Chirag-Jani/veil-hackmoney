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
  - **Ethereum / Arbitrum / Avalanche**: send **ETH** or **AVAX** to any `0x…` address or **ENS name** (e.g. `name.eth`). We resolve ENS on Ethereum mainnet and send to the resolved address. UI shows a resolving state (loader), “Resolves to 0x…”, and blocks Transfer until resolved or shows an error if resolution fails.
  - **Solana**: send **SOL** to any Solana address.

- **Swap & bridge (EVM) — LI.FI**
  - **Same-chain**: single-step swap via LI.FI `GET /quote` (e.g. ETH → USDC on Ethereum).
  - **Cross-chain**: multi-step routes via LI.FI `POST /advanced/routes` — e.g. ETH on Ethereum → USDC on Arbitrum in one flow (swap + bridge or bridge + swap). Steps are executed in sequence; the UI shows “Step 1: … · Step 2: …” when there are multiple steps.
  - **3 EVM chains**: Ethereum, Avalanche, Arbitrum. Source/destination chain + token, amount, slippage (0.5 / 1 / 3%), gas estimate, balance checks, error handling.
  - **Load preferences from ENS**: In the Swap modal, a dropdown lists **recent** ENS names and **built-in presets** (with a short description of each config). You can pick a preset or type any ENS name. Load applies slippage, from/to tokens, and **from/to chains** when the config specifies them (multi-chain presets). Presets that don’t exist on-chain (e.g. `veil-avax.eth`) resolve in-app so they always work.

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

| Item                                                    | Status |
| ------------------------------------------------------- | ------ |
| Swap + bridge (3 EVM chains)                            | Done   |
| Single-step quote (`GET /quote`)                        | Done   |
| Multi-step routes (`POST /advanced/routes`)             | Done   |
| Per-step transaction (`POST /advanced/stepTransaction`) | Done   |
| Execute steps in sequence (bridge + swap in one flow)   | Done   |
| Slippage, gas estimate, error handling                  | Done   |

**APIs used:** `GET /quote`, `POST /v1/advanced/routes`, `POST /v1/advanced/stepTransaction`.

**Eligible tracks:**

- **Best LI.FI-Powered DeFi Integration ($1,500)** — Veil as wallet; LI.FI for cross-chain swap/bridge; slippage, errors, gas handling.
- **Best Use of LI.FI Composer in DeFi ($2,500)** — Multi-step cross-chain flow in one UX (e.g. swap on chain A → bridge to chain B); working frontend; ≥2 EVM chains.

---

## ENS integration (creative DeFi use)

Veil uses ENS as a **portable DeFi profile**: names are not just “name → address”; we read **text records** to respect the user’s swap/send preferences.

- **Transfer (EVM):** Recipient can be an ENS name (e.g. `vitalik.eth`). We resolve on Ethereum mainnet and send to the resolved address. The UI shows “Resolving ENS…” with a loader, then “Resolves to 0x…” once resolved; Transfer is disabled until resolution succeeds or an error is shown.
- **Swap:** “Load swap preferences from ENS” — dropdown to pick **recent** names or **built-in presets**, or type any ENS name. Load applies slippage, from/to tokens, and (when set) **from/to chains** so multi-chain configs work (e.g. loading `veil-avax.eth` switches to Avalanche and sets AVAX → USDC).

**Built-in presets (no on-chain lookup):** Always resolve in-app with fixed configs. Shown in the dropdown with a short description (e.g. “1% · Avax AVAX → Eth USDC”).

| Preset                  | Slippage | From → To   | Chains                |
| ----------------------- | -------- | ----------- | --------------------- |
| `veil-default.eth`      | 1%       | ETH → USDC  | —                     |
| `veil-conservative.eth` | 0.5%     | ETH → USDC  | —                     |
| `veil-flexible.eth`     | 3%       | ETH → USDC  | —                     |
| `veil-stable.eth`       | 1%       | USDC → USDT | —                     |
| `veil-avax.eth`         | 1%       | AVAX → USDC | Avalanche → Ethereum  |
| `veil-arb.eth`          | 1%       | ETH → USDC  | Arbitrum (same chain) |

**ENS text record schema (Veil):** For names that have on-chain records we read:

| Key                         | Meaning                       | Example       |
| --------------------------- | ----------------------------- | ------------- |
| `com.veil.slippage`         | Default slippage % (0–100)    | `1` = 1%      |
| `com.veil.defaultFromToken` | Preferred “from” token symbol | `ETH`, `USDC` |
| `com.veil.defaultToToken`   | Preferred “to” token symbol   | `USDC`        |

If a record is missing we fall back to default values (1% slippage, ETH → USDC). Resolution uses Ethereum mainnet; the same address works for transfers on Arbitrum/Avalanche.

**Eligible track:** ENS — _Most creative use of ENS for DeFi_ ($1,500).

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
  - **ENS — Transfer:** Enter an ENS name in Transfer, show resolving state and “Resolves to 0x…”, then complete the transfer.
  - **ENS — Swap:** Open Swap, use the ENS dropdown to pick a preset (e.g. `veil-avax.eth`) or type a name; click Load and show slippage + from/to tokens (and chain switch for multi-chain presets).
  - Optional: same-chain swap, transfers, or dApp connection.
- [ ] **Composer track (if targeting $2.5k):** Video clearly shows one cross-chain flow with **at least two EVM chains** and a **multi-step** journey (e.g. swap then bridge, or bridge then swap) in one flow.

---

## Tech notes

- **EVM RPCs:** `src/config/rpcs.ts` (retry across multiple RPCs per chain).
- **LI.FI:** `src/utils/lifi.ts` (quote, routes, stepTransaction); execution in `Home.tsx` and `SwapModal.tsx`.
- **ENS:** `src/utils/ens.ts` — `resolveName`, `resolveAddress`, `getText`, `getVeilPreferences`; `PRESET_ENS_CONFIGS` (built-in presets with optional `defaultFromChainId`/`defaultToChainId`); `getRecentEnsNames`/`addRecentEnsName` (recent names in swap dropdown); `formatPresetDescription`. TransferModal: resolve ENS → address with loader and “Resolves to”; block Transfer until resolved. SwapModal: dropdown (recent + presets with description), manual input, Load applies slippage + from/to tokens + from/to chains when preset has chain IDs. Resolution on Ethereum mainnet.
- **Chains:** Ethereum (1), Avalanche (43114), Arbitrum (42161). Solana separate.

---

## Links

- [LI.FI API](https://docs.li.fi/api-reference/introduction)
- [LI.FI Composer / multi-step](https://docs.li.fi/introduction/user-flows-and-examples/lifi-composer)
