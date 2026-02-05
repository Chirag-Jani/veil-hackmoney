import { motion } from "framer-motion";
import { Key, X } from "lucide-react";
import { useState } from "react";
import {
  getPrivateKeyFormat,
  incrementBurnerIndex,
  privateKeyToKeypair,
  storeImportedEthereumPrivateKey,
  storeImportedSolanaKeyForIndex,
  validatePrivateKey,
} from "../utils/keyManager";
import { Wallet } from "ethers";
import { setActiveBurnerIndex } from "../utils/settings";
import {
  formatAddress,
  getAddressFromKeypair,
  getAllBurnerWallets,
  storeBurnerWallet,
  type BurnerWallet,
} from "../utils/storage";
import type { NetworkType } from "../types";

interface ImportWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the network that was imported so the parent can switch and reload. */
  onSuccess: (network: NetworkType) => void;
  password: string;
}

export default function ImportWalletModal({
  isOpen,
  onClose,
  onSuccess,
  password,
}: ImportWalletModalProps) {
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = privateKeyInput.trim();
    if (!trimmed) {
      setError("Enter a private key");
      return;
    }
    if (!password) {
      setError("Session expired. Please unlock again.");
      return;
    }
    if (!validatePrivateKey(trimmed)) {
      setError("Invalid private key. Use Solana (base58) or Ethereum (64 hex chars, optional 0x).");
      return;
    }

    setIsSubmitting(true);
    try {
      const keyFormat = getPrivateKeyFormat(trimmed);

      if (keyFormat === "ethereum") {
        const ethWallet = new Wallet(
          trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`
        );
        const existingEth = await getAllBurnerWallets("ethereum");
        if (
          existingEth.some(
            (w) =>
              w.fullAddress?.toLowerCase() === ethWallet.address.toLowerCase()
          )
        ) {
          setError("This wallet is already imported.");
          setIsSubmitting(false);
          return;
        }
        // Store only the imported EVM key; do not overwrite seed or touch Solana.
        await storeImportedEthereumPrivateKey(trimmed, password);

        const ethBurner: BurnerWallet = {
          id: Date.now(),
          address: formatAddress(ethWallet.address),
          fullAddress: ethWallet.address,
          balance: 0,
          site: "Imported Wallet",
          isActive: true,
          index: 0,
          network: "ethereum",
        };
        await storeBurnerWallet(ethBurner);
        await setActiveBurnerIndex("ethereum", 0);
        onSuccess("ethereum");
      } else {
        // Solana: add as new wallet (new index) so existing derived wallet stays. Never overwrite seed.
        const importedKeypair = privateKeyToKeypair(trimmed);
        const address = getAddressFromKeypair(importedKeypair);
        const existingSolana = await getAllBurnerWallets("solana");
        if (
          existingSolana.some(
            (w) => w.fullAddress?.toLowerCase() === address.toLowerCase()
          )
        ) {
          setError("This wallet is already imported.");
          setIsSubmitting(false);
          return;
        }
        const index =
          existingSolana.length === 0
            ? 0
            : await incrementBurnerIndex("solana");

        await storeImportedSolanaKeyForIndex(trimmed, password, index);

        const importedWallet: BurnerWallet = {
          id: Date.now(),
          address: formatAddress(address),
          fullAddress: address,
          balance: 0,
          site: "Imported Wallet",
          isActive: true,
          index,
          network: "solana",
        };
        await storeBurnerWallet(importedWallet);
        await setActiveBurnerIndex("solana", index);
        onSuccess("solana");
      }

      setPrivateKeyInput("");
      onClose();
    } catch (err) {
      console.error("[Veil] Import wallet error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to import wallet. Try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-gray-900 border border-white/10 shadow-xl p-4 pointer-events-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Import Wallet</span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Enter a private key to import an existing wallet. Supports Solana
            (base58) and Ethereum (64 hex chars).
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={privateKeyInput}
              onChange={(e) => {
                setPrivateKeyInput(e.target.value);
                setError("");
              }}
              placeholder="Paste private key (Solana or EVM)"
              className="w-full h-24 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 resize-none font-mono box-border"
              spellCheck={false}
              autoComplete="off"
              disabled={isSubmitting}
            />
            {error && (
              <p className="text-xs text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !privateKeyInput.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
}
