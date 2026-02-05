import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  getAllTransactions,
  formatTransactionAmount,
  formatTransactionDate,
  formatTransactionDateDetailed,
  type Transaction,
  type TransactionType,
} from "../utils/transactionHistory";
import { formatAddress } from "../utils/storage";
import type { NetworkType } from "../types";

// Solana Logo SVG Component
const SolanaLogo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 397.7 311.7"
    className={className}
    fill="currentColor"
  >
    <path
      d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
      fill="#14F195"
    />
    <path
      d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
      fill="#9945FF"
    />
    <path
      d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
      fill="#00D4FF"
    />
  </svg>
);

const History = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TransactionType | "all">("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const allTxs = await getAllTransactions();
        setTransactions(allTxs);
      } catch (error) {
        console.error("[History] Error loading transactions:", error);
      }
    };

    const initialTimeout = setTimeout(loadTransactions, 0);
    const interval = setInterval(loadTransactions, 5000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const filteredTransactions =
    filter === "all"
      ? transactions
      : transactions.filter((tx) => tx.type === filter);

  const getTransactionTypeLabel = (type: TransactionType): string => {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "withdraw":
        return "Withdraw";
      case "deposit_and_withdraw":
        return "Send Privately";
      case "transfer":
        return "Sent";
      case "incoming":
        return "Received";
      case "swap":
        return "Swap";
    }
  };

  const getTransactionIcon = (type: TransactionType) => {
    switch (type) {
      case "deposit":
        return <Shield className="w-4 h-4 text-purple-400" />;
      case "withdraw":
        return <ArrowUp className="w-4 h-4 text-blue-400" />;
      case "deposit_and_withdraw":
        return <Shield className="w-4 h-4 text-purple-400" />;
      case "transfer":
        return <ArrowUpRight className="w-4 h-4 text-green-400" />;
      case "incoming":
        return <ArrowDown className="w-4 h-4 text-yellow-400" />;
      case "swap":
        return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getTransactionLabel = (type: TransactionType) => {
    switch (type) {
      case "deposit":
        return "Deposit to Privacy";
      case "withdraw":
        return "Withdraw from Privacy";
      case "deposit_and_withdraw":
        return "Send Privately";
      case "transfer":
        return "Transfer";
      case "incoming":
        return "Incoming";
      case "swap":
        return "Swap";
    }
  };

  const getNetworkLabel = (network?: NetworkType): string => {
    if (!network) return "Solana";
    switch (network) {
      case "ethereum":
        return "Ethereum";
      case "avalanche":
        return "Avalanche";
      case "arbitrum":
        return "Arbitrum";
      default:
        return "Solana";
    }
  };

  const getExplorerUrl = (signature: string, network?: NetworkType): string => {
    switch (network) {
      case "ethereum":
        return `https://etherscan.io/tx/${signature}`;
      case "avalanche":
        return `https://snowtrace.io/tx/${signature}`;
      case "arbitrum":
        return `https://arbiscan.io/tx/${signature}`;
      default:
        return `https://solscan.io/tx/${signature}`;
    }
  };

  const getStatusLabel = (status: Transaction["status"]): string => {
    switch (status) {
      case "confirmed":
        return "Succeeded";
      case "pending":
        return "Pending";
      case "failed":
        return "Failed";
    }
  };

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "confirmed":
        return "text-green-400";
      case "pending":
        return "text-yellow-400";
      case "failed":
        return "text-red-400";
    }
  };

  const getNetworkFee = (tx: Transaction): number => {
    // Estimate network fee (typically ~5000 lamports = 0.000005 SOL)
    // For privacy cash transactions, fees might be higher
    if (tx.type === "deposit" || tx.type === "withdraw" || tx.type === "deposit_and_withdraw") {
      return 0.00001; // Privacy cash operations have higher fees
    }
    return 0.000005; // Standard transfer fee
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openExplorer = (signature: string, network?: NetworkType) => {
    window.open(getExplorerUrl(signature, network), "_blank");
  };

  return (
    <div className="h-full w-full bg-black text-white p-2.5 relative flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <h1 className="text-base font-bold">Activity</h1>
      </div>

      {/* Filters - More compact */}
      <div className="flex flex-wrap gap-1 mb-3">
        {(["all", "deposit", "withdraw", "deposit_and_withdraw", "transfer", "swap", "incoming"] as const).map(
          (filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                filter === filterType
                  ? "bg-white/10 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {filterType === "all"
                ? "All"
                : filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            </button>
          )
        )}
      </div>

      {/* Transactions List - More compact */}
      <div className="flex-1 overflow-y-auto">
        {filteredTransactions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-2">No transactions yet</p>
              <p className="text-gray-600 text-xs">
                Your transaction history will appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTransactions.map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedTx(tx)}
                className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-medium text-white">
                          {getTransactionLabel(tx.type)}
                        </span>
                        <span
                          className={`text-[9px] font-medium ${getStatusColor(
                            tx.status
                          )}`}
                        >
                          {tx.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {formatTransactionDate(tx.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-semibold text-white">
                      {tx.type === "withdraw" || tx.type === "transfer" || tx.type === "deposit_and_withdraw" || tx.type === "swap"
                        ? "-"
                        : "+"}
                      {formatTransactionAmount(tx.amount)} {tx.symbol ?? "SOL"}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction Details Modal - Redesigned */}
      <AnimatePresence>
        {selectedTx && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTx(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-black rounded-t-2xl z-50 border-t border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              <div className="px-4 pb-6">
                {/* Header - Transaction Type */}
                <div className="text-center mb-4">
                  <h2 className="text-lg font-semibold text-white">
                    {getTransactionTypeLabel(selectedTx.type)}
                  </h2>
                </div>

                {/* Icon - Solana Logo with Transaction Type Overlay */}
                <div className="flex justify-center mb-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                      <SolanaLogo className="w-10 h-10 text-white/80" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                      {getTransactionIcon(selectedTx.type)}
                    </div>
                  </div>
                </div>

                {/* Amount - Large Display */}
                <div className="text-center mb-6">
                  <div className="text-2xl font-bold text-white">
                    {selectedTx.type === "withdraw" || selectedTx.type === "transfer" || selectedTx.type === "deposit_and_withdraw" || selectedTx.type === "swap"
                      ? "-"
                      : selectedTx.type === "incoming"
                      ? "+"
                      : ""}
                    {formatTransactionAmount(selectedTx.amount)} {selectedTx.symbol ?? "SOL"}
                  </div>
                </div>

                {/* Transaction Details Card */}
                <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
                  {/* Date */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Date</span>
                    <span className="text-xs text-white">
                      {formatTransactionDateDetailed(selectedTx.timestamp)}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Status</span>
                    <span
                      className={`text-xs font-medium ${getStatusColor(
                        selectedTx.status
                      )}`}
                    >
                      {getStatusLabel(selectedTx.status)}
                    </span>
                  </div>

                  {/* To Address */}
                  {selectedTx.toAddress && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">To</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white font-mono">
                          {formatAddress(selectedTx.toAddress, 4)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(selectedTx.toAddress!, selectedTx.id + "-to");
                          }}
                          className="p-0.5 hover:bg-white/10 rounded transition-colors"
                        >
                          {copiedId === selectedTx.id + "-to" ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* From Address */}
                  {selectedTx.fromAddress && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">From</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white font-mono">
                          {formatAddress(selectedTx.fromAddress, 4)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(selectedTx.fromAddress!, selectedTx.id + "-from");
                          }}
                          className="p-0.5 hover:bg-white/10 rounded transition-colors"
                        >
                          {copiedId === selectedTx.id + "-from" ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Network */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Network</span>
                    <span className="text-xs text-white">
                      {getNetworkLabel(selectedTx.network)}
                    </span>
                  </div>

                  {/* Network Fee */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Network Fee</span>
                    <span className="text-xs text-white">
                      -&lt; {formatTransactionAmount(getNetworkFee(selectedTx))} {selectedTx.symbol ?? "SOL"}
                    </span>
                  </div>
                </div>

                {/* Private Balance Info (if applicable) */}
                {(selectedTx.privateBalanceBefore !== undefined ||
                  selectedTx.privateBalanceAfter !== undefined) && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-4">
                    <div className="text-xs text-purple-400 font-medium mb-2">
                      Private Balance
                    </div>
                    {selectedTx.privateBalanceBefore !== undefined && (
                      <div className="text-xs text-gray-400 mb-1">
                        Before: {formatTransactionAmount(selectedTx.privateBalanceBefore)} SOL
                      </div>
                    )}
                    {selectedTx.privateBalanceAfter !== undefined && (
                      <div className="text-xs text-white font-medium">
                        After: {formatTransactionAmount(selectedTx.privateBalanceAfter)} SOL
                      </div>
                    )}
                  </div>
                )}

                {/* Error Message (if failed) */}
                {selectedTx.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
                    <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                    <div className="text-xs text-red-300">{selectedTx.error}</div>
                  </div>
                )}

                {/* View on Explorer Link */}
                {selectedTx.signature && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openExplorer(selectedTx.signature!, selectedTx.network);
                    }}
                    className="w-full text-center text-sm text-purple-400 hover:text-purple-300 transition-colors py-2"
                  >
                    View on {selectedTx.network === "ethereum" ? "Etherscan" : selectedTx.network === "avalanche" ? "Snowtrace" : selectedTx.network === "arbitrum" ? "Arbiscan" : "Solscan"}
                  </button>
                )}

                {/* Close Button */}
                <button
                  onClick={() => setSelectedTx(null)}
                  className="w-full py-2.5 px-4 font-medium rounded-xl text-sm border border-white/20 text-white hover:bg-white/10 transition-colors mt-2"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default History;
