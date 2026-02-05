import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, Check, Copy, Loader2, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/errorHandler";
import { formatAddress } from "../utils/storage";

interface SendPrivatelyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendPrivately: (amount: number, recipient?: string) => Promise<void>;
  availableBalance: number; // SOL balance available to send
  defaultRecipient?: string; // Default recipient address (active wallet)
}

const SendPrivatelyModal = ({
  isOpen,
  onClose,
  onSendPrivately,
  availableBalance,
  defaultRecipient,
}: SendPrivatelyModalProps) => {
  const [amount, setAmount] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [useDefaultRecipient, setUseDefaultRecipient] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setRecipient("");
      setUseDefaultRecipient(true);
      setIsSending(false);
      setError(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!isSending) {
      setAmount("");
      setRecipient("");
      setUseDefaultRecipient(true);
      setError(null);
      onClose();
    }
  };

  const handleMax = () => {
    setAmount(availableBalance.toFixed(9));
    setError(null);
  };

  const handleCopyAddress = () => {
    if (defaultRecipient) {
      navigator.clipboard.writeText(defaultRecipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendPrivately = async () => {
    const sendAmount = parseFloat(amount);

    // Validation
    if (isNaN(sendAmount) || sendAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (sendAmount > availableBalance) {
      setError("Insufficient balance");
      return;
    }

    if (sendAmount < 0.01) {
      setError("Minimum amount is 0.01 SOL");
      return;
    }

    // Validate recipient if custom address is used
    if (!useDefaultRecipient) {
      if (!recipient || recipient.length < 32) {
        setError("Please enter a valid recipient address");
        return;
      }
    }

    setIsSending(true);
    setError(null);

    try {
      const finalRecipient = useDefaultRecipient ? undefined : recipient;
      console.log("[Veil Modal] Calling onSendPrivately with:", { sendAmount, finalRecipient });
      
      await onSendPrivately(sendAmount, finalRecipient);
      
      console.log("[Veil Modal] Send privately succeeded!");
      // Success - close modal after a brief delay
      setTimeout(() => {
        setAmount("");
        setIsSending(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error("[Veil Modal] Send privately failed:", err);
      setError(getErrorMessage(err, "sending funds privately"));
      setIsSending(false);
    }
  };

  const sendAmount = parseFloat(amount) || 0;
  const isValid =
    sendAmount > 0 &&
    sendAmount <= availableBalance &&
    sendAmount >= 0.01 &&
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center border border-purple-500/30">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Send Privately</h3>
                    <p className="text-xs text-gray-500">Deposit & withdraw in one transaction</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSending}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Available Balance */}
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Available Balance</span>
                  <span className="text-sm font-semibold text-white">
                    {availableBalance.toFixed(3)} SOL
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Amount to Send
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
                    disabled={isSending}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={handleMax}
                    disabled={isSending}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors disabled:opacity-50"
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
                      disabled={isSending}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
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
                      disabled={isSending}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
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
                      disabled={isSending}
                      className="mt-2 w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                    />
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="mb-6 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-start gap-2">
                  <ArrowDownUp className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-purple-300 font-medium mb-1">
                      How it works
                    </p>
                    <p className="text-xs text-purple-400/80">
                      Your funds move through a privacy pool and are withdrawn to the recipient, 
                      making the transaction unlinkable on-chain. This typically takes 60-90 seconds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSendPrivately}
                  disabled={!isValid || isSending}
                  className={`w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                    isValid && !isSending
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 active:scale-[0.98]"
                      : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                  }`}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Privately...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      <span>
                        Send {sendAmount > 0 ? `${sendAmount.toFixed(3)} SOL` : ""} Privately
                      </span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={isSending}
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

export default SendPrivatelyModal;
