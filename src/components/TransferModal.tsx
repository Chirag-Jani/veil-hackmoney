import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NetworkType } from "../types";
import { looksLikeEnsName, resolveName } from "../utils/ens";
import { getErrorMessage } from "../utils/errorHandler";
import { formatAddress } from "../utils/storage";

function isValidEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (amount: number, recipient: string) => Promise<string>;
  availableBalance: number;
  fromAddress: string;
  network?: NetworkType;
}

const TransferModal = ({
  isOpen,
  onClose,
  onTransfer,
  availableBalance,
  fromAddress,
  network = "ethereum",
}: TransferModalProps) => {
  const [amount, setAmount] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [resolvedEnsAddress, setResolvedEnsAddress] = useState<string | null>(
    null,
  );
  const [resolvingEns, setResolvingEns] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveEnsRecipient = async () => {
    if (!isEvm || !recipient.trim() || !looksLikeEnsName(recipient)) return;
    setResolvingEns(true);
    setError(null);
    try {
      const addr = await resolveName(recipient.trim());
      setResolvedEnsAddress(addr);
      if (!addr) setError("ENS name could not be resolved");
    } catch {
      setResolvedEnsAddress(null);
      setError("Failed to resolve ENS name");
    } finally {
      setResolvingEns(false);
    }
  };

  const isEvm =
    network === "ethereum" || network === "avalanche" || network === "arbitrum";
  const symbol = network === "avalanche" ? "AVAX" : isEvm ? "ETH" : "SOL";
  const feeEstimate = isEvm ? 0.001 : 0.000005;
  const minAmount = isEvm ? 0.0001 : 0.000001;

  // Auto-resolve ENS when user types a name (debounced) so we show "Resolving ENS…" instead of "Resolve ENS to continue"
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isEvm || !recipient.trim() || !looksLikeEnsName(recipient)) return;
    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
    resolveTimeoutRef.current = setTimeout(() => {
      resolveTimeoutRef.current = null;
      resolveEnsRecipient();
    }, 400);
    return () => {
      if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current);
    };
  }, [recipient, isEvm]);

  const handleClose = () => {
    if (!isTransferring) {
      setAmount("");
      setRecipient("");
      setResolvedEnsAddress(null);
      setError(null);
      onClose();
    }
  };

  const handleMax = () => {
    const maxAmount = Math.max(0, availableBalance - feeEstimate);
    setAmount(maxAmount.toFixed(isEvm ? 6 : 9));
    setError(null);
  };

  const handleTransfer = async () => {
    const transferAmount = parseFloat(amount);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (transferAmount > availableBalance) {
      setError("Insufficient balance");
      return;
    }

    if (transferAmount < minAmount) {
      setError(`Minimum transfer is ${minAmount} ${symbol}`);
      return;
    }

    if (!recipient || recipient.trim().length === 0) {
      setError("Please enter a valid recipient address");
      return;
    }

    let finalRecipient: string;
    if (isEvm) {
      if (isValidEthAddress(recipient)) {
        finalRecipient = recipient.trim();
      } else if (looksLikeEnsName(recipient)) {
        const resolved = await resolveName(recipient.trim());
        if (!resolved) {
          setError("ENS name could not be resolved");
          return;
        }
        finalRecipient = resolved;
        setResolvedEnsAddress(resolved);
      } else {
        setError("Invalid Ethereum address or ENS name (e.g. vitalik.eth)");
        return;
      }
    } else {
      try {
        new PublicKey(recipient);
      } catch {
        setError("Invalid Solana address");
        return;
      }
      finalRecipient = recipient.trim();
    }

    setIsTransferring(true);
    setError(null);

    try {
      await onTransfer(transferAmount, finalRecipient);
      setTimeout(() => {
        setAmount("");
        setRecipient("");
        setIsTransferring(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error("[TransferModal] Transfer error:", err);
      setError(getErrorMessage(err, "transferring funds"));
      setIsTransferring(false);
    }
  };

  const transferAmount = parseFloat(amount) || 0;
  const isEnsRecipient = isEvm && looksLikeEnsName(recipient);
  const ensReady = isEnsRecipient && resolvedEnsAddress && !resolvingEns;
  const recipientValid = isEvm
    ? isValidEthAddress(recipient) || ensReady
    : recipient.length >= 32;
  const isValid =
    transferAmount > 0 &&
    transferAmount <= availableBalance &&
    transferAmount >= minAmount &&
    recipientValid &&
    !resolvingEns;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-50 border-t border-white/10 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            <div className="px-4 pb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600/20 to-blue-600/20 flex items-center justify-center border border-green-500/30">
                    <ArrowRight className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Transfer {symbol}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Send {symbol} to another address
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isTransferring}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* From Address */}
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">From</span>
                  <span className="text-xs font-mono text-gray-400">
                    {formatAddress(fromAddress)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Available</span>
                  <span className="text-sm font-semibold text-white">
                    {availableBalance.toFixed(3)} {symbol}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Amount to Transfer
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError(null);
                    }}
                    placeholder="0.00"
                    step={minAmount}
                    min={minAmount}
                    max={availableBalance}
                    disabled={isTransferring}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={handleMax}
                    disabled={isTransferring}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Recipient Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Recipient {isEvm ? "address or ENS name" : "Address"}
                </label>
                <div
                  className={`relative rounded-xl border transition-colors ${
                    resolvingEns
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <input
                    type="text"
                    value={recipient}
                    onBlur={resolveEnsRecipient}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      setResolvedEnsAddress(null);
                      setError(null);
                    }}
                    placeholder={
                      isEvm ? "0x... or name.eth" : "Enter Solana address"
                    }
                    disabled={isTransferring || resolvingEns}
                    className="w-full px-4 py-3 pr-10 bg-transparent text-white placeholder-gray-600 focus:outline-none focus:ring-0 disabled:opacity-70 disabled:cursor-wait font-mono text-sm rounded-xl"
                  />
                  {resolvingEns && isEvm && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    </div>
                  )}
                </div>
                {resolvingEns && isEvm && (
                  <p className="mt-1.5 text-xs text-amber-400/90 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Resolving ENS name…
                  </p>
                )}
                {resolvedEnsAddress && isEvm && !resolvingEns && (
                  <p className="mt-1.5 text-xs text-green-400/90">
                    Resolves to {formatAddress(resolvedEnsAddress)}
                  </p>
                )}
                {error && (
                  <div className="mt-1.5">
                    <p className="text-xs text-red-400 font-medium">{error}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleTransfer}
                  disabled={!isValid || isTransferring}
                  className={`w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                    isValid && !isTransferring
                      ? "bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-500 hover:to-blue-500 active:scale-[0.98]"
                      : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                  }`}
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transferring...</span>
                    </>
                  ) : isEnsRecipient && !resolvedEnsAddress && !error ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Resolving ENS…</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      <span>
                        Transfer{" "}
                        {transferAmount > 0
                          ? `${transferAmount.toFixed(3)} ${symbol}`
                          : ""}
                      </span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isTransferring}
                  className="w-full py-2.5 px-4 font-medium rounded-xl text-sm border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TransferModal;
