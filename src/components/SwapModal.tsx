import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, Loader2, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LifiChainId } from "../utils/lifi";
import {
  getLifiQuote,
  getTokensForChain,
  LIFI_CHAINS,
  type LifiQuote,
} from "../utils/lifi";
import { getErrorMessage } from "../utils/errorHandler";

const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 0.005 },
  { label: "1%", value: 0.01 },
  { label: "3%", value: 0.03 },
];

const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

function formatTokenAmount(amountWei: string, decimals: number): string {
  const n = Number(amountWei) / 10 ** decimals;
  if (n >= 1e6) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (quote: LifiQuote) => Promise<string>;
  fromAddress: string;
  availableBalanceEth: number;
  /** Current EVM network so we default fromChainId correctly */
  evmNetwork?: "ethereum" | "avalanche" | "arbitrum";
}

export default function SwapModal({
  isOpen,
  onClose,
  onExecute,
  fromAddress,
  availableBalanceEth,
  evmNetwork = "ethereum",
}: SwapModalProps) {
  const defaultFromChain =
    evmNetwork === "arbitrum"
      ? 42161
      : evmNetwork === "avalanche"
        ? 43114
        : 1;
  const [fromChainId, setFromChainId] = useState<LifiChainId>(
    defaultFromChain as LifiChainId
  );
  const [toChainId, setToChainId] = useState<LifiChainId>(
    defaultFromChain === 42161 ? 1 : defaultFromChain === 43114 ? 1 : 43114
  );
  const [fromTokenAddress, setFromTokenAddress] = useState<string>(NATIVE_ADDRESS);
  const [toTokenAddress, setToTokenAddress] = useState<string>(
    defaultFromChain === 42161
      ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      : defaultFromChain === 43114
        ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
  );

  useEffect(() => {
    if (!isOpen) return;
    const fromChain =
      evmNetwork === "arbitrum"
        ? 42161
        : evmNetwork === "avalanche"
          ? 43114
          : 1;
    setFromChainId(fromChain as LifiChainId);
    setToChainId((fromChain === 42161 || fromChain === 43114 ? 1 : 43114) as LifiChainId);
    setFromTokenAddress(NATIVE_ADDRESS);
    setToTokenAddress(
      fromChain === 42161 || fromChain === 43114
        ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
    );
  }, [isOpen, evmNetwork]);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.005);
  const [showSlippage, setShowSlippage] = useState(false);
  const [quote, setQuote] = useState<LifiQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const fromTokens = getTokensForChain(fromChainId);
  const toTokens = getTokensForChain(toChainId);
  const fromToken = fromTokens.find((t) => t.address === fromTokenAddress) ?? fromTokens[0]!;
  const toToken = toTokens.find((t) => t.address === toTokenAddress) ?? toTokens[0]!;

  const fetchQuote = useCallback(async () => {
    const amountTrim = amount.trim();
    if (!amountTrim || Number(amountTrim) <= 0 || !fromAddress) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    if (!isEvmAddress(fromAddress)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const fromAmountWei = BigInt(
      Math.floor(Number(amountTrim) * 10 ** fromToken.decimals)
    ).toString();
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const fromTokenParam =
        fromToken.address === NATIVE_ADDRESS ? fromToken.symbol : fromToken.address;
      const toTokenParam =
        toToken.address === NATIVE_ADDRESS ? toToken.symbol : toToken.address;
      const q = await getLifiQuote({
        fromChainId,
        toChainId,
        fromToken: fromTokenParam,
        toToken: toTokenParam,
        fromAmountWei,
        fromAddress,
        slippage,
      });
      setQuote(q);
    } catch (e) {
      console.error("[SwapModal] Quote error:", e);
      setQuote(null);
      setQuoteError(getErrorMessage(e, "fetching quote"));
    } finally {
      setQuoteLoading(false);
    }
  }, [
    amount,
    fromAddress,
    fromChainId,
    toChainId,
    fromToken.address,
    fromToken.decimals,
    toToken.address,
    slippage,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(fetchQuote, 400);
    return () => clearTimeout(t);
  }, [isOpen, fetchQuote]);

  const handleClose = () => {
    if (!executing) {
      setAmount("");
      setQuote(null);
      setQuoteError(null);
      setExecuteError(null);
      setShowSlippage(false);
      onClose();
    }
  };

  const handleMax = () => {
    const reserve =
      fromToken.symbol === "ETH" || fromToken.symbol === "AVAX" ? 0.001 : 0;
    const max = Math.max(0, availableBalanceEth - reserve);
    setAmount(max.toFixed(6));
    setQuoteError(null);
  };

  const handleExecute = async () => {
    if (!quote) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await onExecute(quote);
      handleClose();
    } catch (e) {
      setExecuteError(getErrorMessage(e, "executing swap"));
    } finally {
      setExecuting(false);
    }
  };

  const amountNum = Number(amount) || 0;
  const hasEnoughBalance =
    fromToken.symbol === "ETH"
      ? amountNum <= availableBalanceEth && availableBalanceEth >= 0.001
      : true;
  const canConfirm =
    quote &&
    amountNum > 0 &&
    hasEnoughBalance &&
    !quoteLoading &&
    !executing;

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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Swap</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSlippage((s) => !s)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    title="Slippage"
                  >
                    <Settings2 className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={executing}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {showSlippage && (
                <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-400 mb-2">Slippage tolerance</p>
                  <div className="flex gap-2">
                    {SLIPPAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSlippage(opt.value);
                          setShowSlippage(false);
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                          slippage === opt.value
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* From */}
              <div className="mb-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">From</p>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setQuoteError(null);
                    }}
                    placeholder="0.00"
                    className="flex-1 min-w-0 bg-transparent text-white text-lg font-medium focus:outline-none placeholder-gray-600"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={fromTokenAddress}
                      onChange={(e) => setFromTokenAddress(e.target.value)}
                      className="bg-white/10 text-white text-sm font-medium rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    >
                      {fromTokens.map((t) => (
                        <option key={t.address} value={t.address}>
                          {t.symbol}
                        </option>
                      ))}
                    </select>
                    <select
                      value={fromChainId}
                      onChange={(e) =>
                        setFromChainId(Number(e.target.value) as LifiChainId)
                      }
                      className="bg-white/10 text-gray-300 text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none"
                    >
                      {LIFI_CHAINS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">Balance</span>
                  <button
                    type="button"
                    onClick={handleMax}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    {fromToken.symbol === "ETH" || fromToken.symbol === "AVAX"
                      ? `${availableBalanceEth.toFixed(6)} ${fromToken.symbol}`
                      : "—"}
                  </button>
                </div>
              </div>

              <div className="flex justify-center -my-1 relative z-10">
                <div className="rounded-full bg-gray-900 border border-white/10 p-1">
                  <ArrowDownUp className="w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* To */}
              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">To</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 text-lg font-medium text-white">
                    {quote
                      ? formatTokenAmount(
                          quote.estimate.toAmount,
                          toToken.decimals
                        )
                      : "0.00"}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={toTokenAddress}
                      onChange={(e) => setToTokenAddress(e.target.value)}
                      className="bg-white/10 text-white text-sm font-medium rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    >
                      {toTokens.map((t) => (
                        <option key={t.address} value={t.address}>
                          {t.symbol}
                        </option>
                      ))}
                    </select>
                    <select
                      value={toChainId}
                      onChange={(e) =>
                        setToChainId(Number(e.target.value) as LifiChainId)
                      }
                      className="bg-white/10 text-gray-300 text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none"
                    >
                      {LIFI_CHAINS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {quote && (
                  <p className="text-xs text-gray-500 mt-1">
                    Min received:{" "}
                    {formatTokenAmount(
                      quote.estimate.toAmountMin,
                      toToken.decimals
                    )}{" "}
                    {toToken.symbol} (slippage)
                  </p>
                )}
              </div>

              {quoteLoading && (
                <div className="flex items-center gap-2 mb-3 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Getting quote...</span>
                </div>
              )}
              {quoteError && (
                <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{quoteError}</p>
                </div>
              )}
              {executeError && (
                <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{executeError}</p>
                </div>
              )}

              {quote && quote.estimate.gasCosts && quote.estimate.gasCosts.length > 0 && (
                <div className="mb-3 text-xs text-gray-500">
                  Est. gas:{" "}
                  {quote.estimate.gasCosts
                    .map(
                      (g) =>
                        `${(Number(g.amount) / 10 ** (g.token?.decimals ?? 18)).toFixed(6)} ${g.token?.symbol ?? "ETH"}`
                    )
                    .join(", ")}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExecute}
                  disabled={!canConfirm}
                  className={`w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                    canConfirm
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98]"
                      : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                  }`}
                >
                  {executing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Swapping...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownUp className="w-4 h-4" />
                      <span>Swap</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  disabled={executing}
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
}
