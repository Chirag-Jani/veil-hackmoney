import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Loader2, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/errorHandler";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (amount: number) => Promise<void>;
  availableBalance: number; // SOL balance available to deposit
}

const DepositModal = ({
  isOpen,
  onClose,
  onDeposit,
  availableBalance,
}: DepositModalProps) => {
  const [amount, setAmount] = useState<string>("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setIsDepositing(false);
      setError(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!isDepositing) {
      setAmount("");
      setError(null);
      onClose();
    }
  };

  const handleMax = () => {
    setAmount(availableBalance.toFixed(9));
    setError(null);
  };

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);

    // Validation
    if (isNaN(depositAmount) || depositAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (depositAmount > availableBalance) {
      setError("Insufficient balance");
      return;
    }

    if (depositAmount < 0.01) {
      setError("Minimum deposit is 0.01 SOL");
      return;
    }

    setIsDepositing(true);
    setError(null);

    try {
      await onDeposit(depositAmount);
      // Success - close modal after a brief delay
      setTimeout(() => {
        setAmount("");
        setIsDepositing(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError(getErrorMessage(err, "depositing funds"));
      setIsDepositing(false);
    }
  };

  const depositAmount = parseFloat(amount) || 0;
  const isValid =
    depositAmount > 0 &&
    depositAmount <= availableBalance &&
    depositAmount >= 0.01;

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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center border border-purple-500/30">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Deposit to Privacy
                    </h3>
                    <p className="text-xs text-gray-500">
                      Migrate funds to private balance
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isDepositing}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Available Balance */}
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Available Balance
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {availableBalance.toFixed(4)} SOL
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Amount to Deposit
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
                    max={availableBalance}
                    disabled={isDepositing}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={handleMax}
                    disabled={isDepositing}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    MAX
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              </div>

              {/* Info Box */}
              <div className="mb-6 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <ArrowDown className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-blue-300 font-medium mb-1">
                      What happens next?
                    </p>
                    <p className="text-xs text-blue-400/80">
                      Your funds will be deposited into a privacy pool, making
                      them unlinkable on-chain. This process typically takes
                      30-60 seconds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleDeposit}
                  disabled={!isValid || isDepositing}
                  className={`w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                    isValid && !isDepositing
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 active:scale-[0.98]"
                      : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                  }`}
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Depositing...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      <span>
                        Deposit{" "}
                        {depositAmount > 0
                          ? `${depositAmount.toFixed(4)} SOL`
                          : ""}
                      </span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isDepositing}
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

export default DepositModal;
