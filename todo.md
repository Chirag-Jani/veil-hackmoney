# Copy/Paste Checklist for veil-hackmoney

Source: `../extension/packages/extension/` → `veil-hackmoney/` (root)

Each section = one commit. Order matters (dependencies flow top to bottom).

---

## Commit 1: Project config ✓

Build tooling and TypeScript setup.

- [x] `eslint.config.js`
- [x] `postcss.config.js`
- [x] `tailwind.config.js`
- [x] `tsconfig.json`
- [x] `tsconfig.app.json`
- [x] `tsconfig.node.json`
- [x] `vite.config.ts`
- [x] `vite.content.config.ts`

---

## Commit 2: Public assets & manifest

Extension metadata and static files.

- [x] `public/manifest.json`
- [x] `public/provider-inject.js`
- [x] `public/solana.svg`
- [x] `public/veil_shield.png`
- [x] `public/veil.png`
- [x] `public/circuit2/transaction2.wasm`
- [x] `public/circuit2/transaction2.zkey`

---

## Commit 3: Types & polyfills

Shared types and polyfills used by the rest of the codebase.

- [x] `src/types.ts`
- [x] `src/types/bs58.d.ts`
- [x] `src/types/crypto-browserify.d.ts`
- [x] `src/polyfills.ts`

---

## Commit 4: Utils – storage & crypto

Base utilities for storage, crypto, and key management.

- [x] `src/utils/storage.ts`
- [x] `src/utils/crypto.ts`
- [x] `src/utils/keyManager.ts`
- [x] `src/utils/settings.ts`

---

## Commit 5: Utils – blockchain layer

RPC, Solana provider, and extension messaging.

- [x] `src/utils/rpcManager.ts`
- [x] `src/utils/messaging.ts`
- [x] `src/utils/solanaProvider.ts`

---

## Commit 6: Utils – Privacy Cash

Privacy Cash integration utilities.

- [x] `src/utils/privacyCashStorage.ts`
- [x] `src/utils/privacyCashSigner.ts`
- [x] `src/utils/privacyCashService.ts`

---

## Commit 7: Utils – wallet & misc

Balance, lock, history, and error handling.

- [x] `src/utils/balanceMonitor.ts`
- [x] `src/utils/walletLock.ts`
- [x] `src/utils/transactionHistory.ts`
- [x] `src/utils/errorHandler.ts`

---

## Commit 8: Components

Shared UI components (modals, approvals, etc.).

- [x] `src/components/ComingSoonModal.tsx`
- [x] `src/components/ConnectionApproval.tsx`
- [x] `src/components/DepositModal.tsx`
- [x] `src/components/PrivacyScoreDisplay.tsx`
- [x] `src/components/SendPrivatelyModal.tsx`
- [x] `src/components/SignApproval.tsx`
- [x] `src/components/TransferModal.tsx`
- [x] `src/components/UnlockWallet.tsx`
- [x] `src/components/WithdrawModal.tsx`

---

## Commit 9: Pages

Route-level views.

- [x] `src/pages/Onboarding.tsx`
- [x] `src/pages/Home.tsx`
- [x] `src/pages/History.tsx`
- [x] `src/pages/ArchivedWallets.tsx`
- [x] `src/pages/Settings.tsx`

---

## Commit 10: App shell

Main app entry, styles, and popup.

- [x] `src/index.css`
- [x] `src/App.tsx`
- [x] `src/popup.html`
- [x] `src/scripts/popup.tsx`

---

## Commit 11: Extension scripts

Background and content scripts.

- [x] `src/scripts/background.ts`
- [x] `src/scripts/content.ts`

---

## One-time setup (before first commit)

- [ ] `npm install`
- [ ] `git init`
