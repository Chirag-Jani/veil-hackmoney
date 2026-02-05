# Veil (HackMoney) Extension

**Privacy by default. Multi-chain (EVM + Solana) wallet for private transfers and burner identities.**

Veil is a privacy-focused burner wallet browser extension built for fast, disposable onchain identities.

It supports **four networks** (one active at a time):
- **Ethereum (mainnet)**: burners, balance, transfer ETH, and **swap/bridge** via LI.FI.
- **Avalanche (mainnet)**: burners, balance, transfer AVAX, and **swap/bridge** via LI.FI.
- **Arbitrum (mainnet)**: burners, balance, transfer ETH, and **swap/bridge** via LI.FI.
- **Solana**: burners, balance, transfer SOL, and (optionally) Veil “Privacy Cash” private transfer flows.

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

- **Swap & bridge (EVM only)**
  - **LI.FI-powered swap** across Ethereum, Avalanche, and Arbitrum (source/destination chain + token, quote, slippage, execute with Veil signer).

- **Balance monitoring**
  - Background balance monitoring for **SOL, ETH, AVAX** (per network).

- **dApp connection (Solana + Ethereum providers)**
  - Exposes a **Solana-compatible provider** via `window.veil` and coexists under `window.solana.providers` when other wallets are installed.
  - Exposes a **minimal EIP-1193 Ethereum provider** via `window.ethereum` (only if no other Ethereum provider is present) and always via `window.veilEthereum`.
  - Connection is **origin-scoped** (sites must request access) and requires the wallet to be **unlocked** plus **user approval** in the popup.
  - Solana: supports connect/disconnect and **message signing** approval flows (transaction signing is currently not available).
  - Ethereum: supports `eth_chainId`, `net_version`, `eth_accounts`, `eth_coinbase`, `eth_requestAccounts`, and `wallet_*` permission methods needed for basic dApp connection.

- **Privacy Cash mode (Solana-only)**
  - When enabled in settings, Solana burners can use private transfer flows:
    - **Deposit to privacy**
    - **Withdraw from privacy**
    - **Private transfer**
  - These actions are **hidden/disabled on Ethereum**.

## Key management & export

- Burners are derived from an encrypted seed stored by the extension.
- **Export private key** is supported for all networks:
  - **Ethereum / Avalanche / Arbitrum**: exports a hex private key for the selected EVM burner.
  - **Solana**: exports a Base58 secret key for the selected Solana burner (Phantom import format).

## Asset prices

- **ETH**, **AVAX**, and **SOL** USD prices are **fetched dynamically** from CoinGecko (on load and every 5 minutes). Fallback values are used only until the first successful fetch or if the request fails.

## Notes

- Ethereum, Avalanche, and Arbitrum RPCs are configured in `src/config/rpcs.ts` (with retry across multiple RPCs per chain).
- Solana and EVM wallet indices are tracked separately per network to avoid collisions.

## LI.FI (HackMoney track) — current status

- [x] **Swap + bridge**: LI.FI-powered Swap modal; **3 EVM chains** (Ethereum, Avalanche, Arbitrum).
- [x] **SwapModal**: Source/destination chain + token, amount; LI.FI quote; route summary, slippage (0.5 / 1 / 3%), gas estimate; execute with Veil EVM signer.
- [x] **UX**: Slippage tolerance, error handling, balance/gas checks.
- [ ] **LI.FI Composer** (optional): Multi-step composed routes for “Best Use of LI.FI Composer in DeFi” ($2.5k).
- **Docs**: [LI.FI API](https://docs.li.fi/api-reference/introduction), [End-to-end example](https://docs.li.fi/introduction/user-flows-and-examples/end-to-end-example).