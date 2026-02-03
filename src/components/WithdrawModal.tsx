import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Copy, Loader2, X } from "lucide-react";
import { useState } from "react";
import { getErrorMessage } from "../utils/errorHandler";
import { formatAddress } from "../utils/storage";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWithdraw: (amount: number, recipient?: string) => Promise<void>;
  privateBalance: number; // Private balance available to withdraw
  defaultRecipient?: string; // Default recipient address (active wallet)
}

const WithdrawModal = ({
  isOpen,
  onClose,
  onWithdraw,
  privateBalance,
  defaultRecipient,
}: WithdrawModalProps) => {
  const [amount, setAmount] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [useDefaultRecipient, setUseDefaultRecipient] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    if (!isWithdrawing) {
      setAmount("");
      setRecipient(defaultRecipient || "");
      setUseDefaultRecipient(true);
      setError(null);
      onClose();
    }
  };

  const handleMax = () => {
    setAmount(privateBalance.toFixed(9));
    setError(null);
  };

  const handleCopyAddress = () => {
    if (defaultRecipient) {
      navigator.clipboard.writeText(defaultRecipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);

    // Validation
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (withdrawAmount > privateBalance) {
      setError("Insufficient private balance");
      return;
    }

    if (withdrawAmount < 0.01) {
      setError("Minimum withdrawal is 0.01 SOL");
      return;
    }

    // Validate recipient if custom address is used
    if (!useDefaultRecipient) {
      if (!recipient || recipient.length < 32) {
        setError("Please enter a valid recipient address");
        return;
      }
    }

    setIsWithdrawing(true);
    setError(null);

    try {
      const finalRecipient = useDefaultRecipient ? undefined : recipient;
      await onWithdraw(withdrawAmount, finalRecipient);
      // Success - close modal after a brief delay
      setTimeout(() => {
        setAmount("");
        setIsWithdrawing(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError(getErrorMessage(err, "withdrawing funds"));
      setIsWithdrawing(false);
    }
  };

  const withdrawAmount = parseFloat(amount) || 0;
  const isValid =
    withdrawAmount > 0 &&
    withdrawAmount <= privateBalance &&
    withdrawAmount >= 0.01 &&
    (useDefaultRecipient || (recipient && recipient.length >= 32));

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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center border border-blue-500/30">
                    <ArrowUp className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Withdraw from Privacy
                    </h3>
                    <p className="text-xs text-gray-500">
                      Move funds from private balance
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isWithdrawing}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Private Balance */}
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Private Balance</span>
                  <span className="text-sm font-semibold text-white">
                    {privateBalance.toFixed(4)} SOL
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Amount to Withdraw
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
                    step="0.01"
                    min="0.01"
                    max={privateBalance}
                    disabled={isWithdrawing}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={handleMax}
                    disabled={isWithdrawing}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    MAX
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              </div>

              {/* Recipient Selection */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Recipient Address
                </label>

                {/* Default Recipient Option */}
                <div className="mb-2">
                  <label className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      checked={useDefaultRecipient}
                      onChange={() => {
                        setUseDefaultRecipient(true);
                        setError(null);
                      }}
                      disabled={isWithdrawing}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white">
                          Active Burner Wallet
                        </span>
                        {defaultRecipient && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyAddress();
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            {copied ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </button>
                        )}
                      </div>
                      {defaultRecipient && (
                        <p className="text-xs text-gray-500 mt-1 font-mono">
                          {formatAddress(defaultRecipient)}
                        </p>
                      )}
                    </div>
                  </label>
                </div>

                {/* Custom Recipient Option */}
                <div>
                  <label className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      checked={!useDefaultRecipient}
                      onChange={() => {
                        setUseDefaultRecipient(false);
                        setError(null);
                      }}
                      disabled={isWithdrawing}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-white">
                      Custom Address
                    </span>
                  </label>
                  {!useDefaultRecipient && (
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => {
                        setRecipient(e.target.value);
                        setError(null);
                      }}
                      placeholder="Enter Solana address"
                      disabled={isWithdrawing}
                      className="mt-2 w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                    />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleWithdraw}
                  disabled={!isValid || isWithdrawing}
                  className={`w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                    isValid && !isWithdrawing
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 active:scale-[0.98]"
                      : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                  }`}
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Withdrawing...</span>
                    </>
                  ) : (
                    <>
                      <ArrowUp className="w-4 h-4" />
                      <span>
                        Withdraw{" "}
                        {withdrawAmount > 0
                          ? `${withdrawAmount.toFixed(4)} SOL`
                          : ""}
                      </span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isWithdrawing}
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

export default WithdrawModal;
