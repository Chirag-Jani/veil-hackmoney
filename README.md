# Veil (HackMoney) Extension

**Privacy by default. Multi-chain (EVM + Solana) wallet for private transfers and burner identities.**

Veil is a privacy-focused burner wallet browser extension built for fast, disposable onchain identities.

It supports **two networks**:
- **Ethereum (mainnet)**: create burner addresses, view balance, and transfer ETH.
- **Solana**: create burner addresses, view balance, transfer SOL, and (optionally) use Veil “Privacy Cash” private transfer flows.

## What it does

- **Create and manage burner addresses**
  - Generate multiple “Account N” burner wallets.
  - Quickly switch between burners.
  - Archive old burners to keep the wallet list clean.

- **Network switching**
  - Toggle between **Ethereum** and **Solana**.
  - Each network maintains its own active burner and wallet list.

- **Transfers**
  - **Ethereum**: send **ETH** to any `0x…` address.
  - **Solana**: send **SOL** to any Solana address.

- **Balance monitoring**
  - Background balance monitoring updates burner balances for **SOL and ETH**.

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
- **Export private key** is supported for both networks:
  - **Ethereum**: exports a hex private key for the selected Ethereum burner.
  - **Solana**: exports a Base58 secret key for the selected Solana burner (Phantom import format).

## Notes

- Ethereum RPCs can be provided via extension env/config (with a built-in fallback RPC if none are set).
- Solana and Ethereum wallet indices are tracked separately to avoid collisions across networks.

## Todo — LI.FI (HackMoney track)

- [ ] **Swap + bridge**: Replace “Coming soon” Swap with LI.FI-powered flow; support ≥2 EVM chains (e.g. Ethereum + Base/Arbitrum).
- [ ] **SwapModal / Swap UI**: Source/destination chain + token, amount; get LI.FI quote; show route, slippage, gas; execute with Veil EVM signer (`getEthereumWalletForIndex` + ethers).
- [ ] **LI.FI Composer**: Use Composer for one multi-step flow (e.g. swap+bridge in one sign) to target “Best Use of LI.FI Composer in DeFi” ($2.5k).
- [ ] **UX**: Slippage tolerance, error handling, gas checks (match “Best LI.FI-Powered DeFi Integration” requirements).
- [ ] **(Optional)** “Deposit from anywhere”: LI.FI route (e.g. ETH on Ethereum → SOL on Solana) then existing “Deposit to Privacy” flow.
- [ ] **Docs**: [LI.FI docs](https://docs.li.fi/), [End-to-end example](https://docs.li.fi/introduction/user-flows-and-examples/end-to-end-example), [API](https://docs.li.fi/api-reference/introduction), [SDK](https://docs.li.fi/sdk/overview).