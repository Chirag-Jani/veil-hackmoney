import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  ChevronDown,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "../utils/errorHandler";
import type { LifiChainId } from "../utils/lifi";
import {
  getLifiQuote,
  getTokensForChain,
  LIFI_CHAINS,
  LIFI_TOKENS_BY_CHAIN,
  type LifiQuote,
} from "../utils/lifi";

type TokenWithChain = {
  chainId: number;
  chainName: string;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
};

function getAllTokensWithChains(): TokenWithChain[] {
  const out: TokenWithChain[] = [];
  for (const chain of LIFI_CHAINS) {
    const tokens = LIFI_TOKENS_BY_CHAIN[chain.id] ?? [];
    for (const t of tokens) {
      out.push({ ...t, chainId: chain.id, chainName: chain.name });
    }
  }
  return out;
}

const CHAIN_COLORS: Record<number, string> = {
  1: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  43114: "bg-red-500/20 text-red-300 border-red-500/40",
  42161: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
};

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
  /** Fetch native balance for the given chain (ETH/AVAX). Returns balance in token units. */
  getBalanceForChain?: (chainId: number) => Promise<number>;
  /** Called when modal opens; use to refresh global balances in parent. */
  onOpened?: () => void;
  /** Current EVM network so we default fromChainId correctly */
  evmNetwork?: "ethereum" | "avalanche" | "arbitrum";
}

export default function SwapModal({
  isOpen,
  onClose,
  onExecute,
  fromAddress,
  availableBalanceEth,
  getBalanceForChain,
  onOpened,
  evmNetwork = "ethereum",
}: SwapModalProps) {
  const defaultFromChain =
    evmNetwork === "arbitrum" ? 42161 : evmNetwork === "avalanche" ? 43114 : 1;
  const [fromChainId, setFromChainId] = useState<LifiChainId>(
    defaultFromChain as LifiChainId,
  );
  const [toChainId, setToChainId] = useState<LifiChainId>(
    defaultFromChain === 42161 ? 1 : defaultFromChain === 43114 ? 1 : 43114,
  );
  const [fromTokenAddress, setFromTokenAddress] =
    useState<string>(NATIVE_ADDRESS);
  const [toTokenAddress, setToTokenAddress] = useState<string>(
    defaultFromChain === 42161
      ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      : defaultFromChain === 43114
        ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
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
    setToChainId(
      (fromChain === 42161 || fromChain === 43114 ? 1 : 43114) as LifiChainId,
    );
    setFromTokenAddress(NATIVE_ADDRESS);
    setToTokenAddress(
      fromChain === 42161 || fromChain === 43114
        ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
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
  const [tokenSelectorMode, setTokenSelectorMode] = useState<
    "from" | "to" | null
  >(null);
  const [tokenSelectorChainFilter, setTokenSelectorChainFilter] = useState<
    number | "all"
  >("all");
  const [tokenSelectorSearch, setTokenSelectorSearch] = useState("");
  const [displayBalance, setDisplayBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const allTokensWithChains = useMemo(() => getAllTokensWithChains(), []);
  const filteredTokens = useMemo(() => {
    let list = allTokensWithChains;
    if (tokenSelectorChainFilter !== "all") {
      list = list.filter((t) => t.chainId === tokenSelectorChainFilter);
    }
    const q = tokenSelectorSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allTokensWithChains, tokenSelectorChainFilter, tokenSelectorSearch]);

  const fromTokens = getTokensForChain(fromChainId);
  const toTokens = getTokensForChain(toChainId);
  const fromToken =
    fromTokens.find((t) => t.address === fromTokenAddress) ?? fromTokens[0]!;
  const toToken =
    toTokens.find((t) => t.address === toTokenAddress) ?? toTokens[0]!;

  const hasCalledOnOpenedRef = useRef(false);
  const fallbackBalanceRef = useRef(availableBalanceEth);
  const getBalanceForChainRef = useRef(getBalanceForChain);
  fallbackBalanceRef.current = availableBalanceEth;
  getBalanceForChainRef.current = getBalanceForChain;

  // Call onOpened only once when modal opens
  useEffect(() => {
    if (isOpen && !hasCalledOnOpenedRef.current) {
      hasCalledOnOpenedRef.current = true;
      onOpened?.();
    }
    if (!isOpen) {
      hasCalledOnOpenedRef.current = false;
    }
  }, [isOpen, onOpened]);

  // Fetch balance only when modal opens or user changes from chain. Do not depend on callback or prop balance so parent updates can't retrigger.
  useEffect(() => {
    if (!isOpen) {
      setDisplayBalance(null);
      return;
    }
    const fetchBalance = getBalanceForChainRef.current;
    if (!fetchBalance) {
      setDisplayBalance(fallbackBalanceRef.current);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    fetchBalance(fromChainId)
      .then((bal) => {
        if (!cancelled) setDisplayBalance(bal);
      })
      .catch(() => {
        if (!cancelled) setDisplayBalance(fallbackBalanceRef.current);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, fromChainId]);

  const effectiveBalance = displayBalance ?? availableBalanceEth;

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
      Math.floor(Number(amountTrim) * 10 ** fromToken.decimals),
    ).toString();
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const fromTokenParam =
        fromToken.address === NATIVE_ADDRESS
          ? fromToken.symbol
          : fromToken.address;
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
    fromToken.symbol,
    toToken.address,
    toToken.symbol,
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
      setTokenSelectorMode(null);
      setDisplayBalance(null);
      setFromTokenAddress(NATIVE_ADDRESS);
      setToTokenAddress(
        fromChainId === 42161 || fromChainId === 43114
          ? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
          : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      );
      onClose();
    }
  };

  const handleMax = () => {
    const reserve =
      fromToken.symbol === "ETH" || fromToken.symbol === "AVAX" ? 0.001 : 0;
    const max = Math.max(0, effectiveBalance - reserve);
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
    fromToken.symbol === "ETH" || fromToken.symbol === "AVAX"
      ? amountNum <= effectiveBalance && effectiveBalance >= 0.001
      : true;
  const canConfirm =
    quote && amountNum > 0 && hasEnoughBalance && !quoteLoading && !executing;

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
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-50 border-t border-white/10 max-h-[90vh] overflow-y-auto shadow-2xl pointer-events-auto"
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-0.5 bg-white/20 rounded-full" />
            </div>

            <div className="px-3 pb-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600/20 to-emerald-700/20 flex items-center justify-center border border-emerald-500/30">
                    <ArrowDownUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Swap</h3>
                    <p className="text-[11px] text-gray-500">
                      Swap or bridge across chains
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowSlippage((s) => !s)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    title="Slippage"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={executing}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showSlippage && (
                <div className="mb-3 p-2.5 rounded-lg bg-white/[0.06] border border-white/10">
                  <p className="text-[11px] font-medium text-gray-400 mb-2">
                    Slippage tolerance
                  </p>
                  <div className="flex gap-1.5">
                    {SLIPPAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSlippage(opt.value);
                          setShowSlippage(false);
                        }}
                        className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                          slippage === opt.value
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* From */}
              <div className="mb-1 p-2 rounded-lg bg-white/[0.06] border border-white/10">
                <p className="text-[11px] font-medium text-gray-500 mb-1">
                  From
                </p>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setQuoteError(null);
                    }}
                    placeholder="0.00"
                    className="flex-1 min-w-0 bg-transparent text-white text-lg font-semibold tabular-nums focus:outline-none placeholder-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTokenSelectorSearch("");
                      setTokenSelectorChainFilter("all");
                      setTokenSelectorMode("from");
                    }}
                    className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-2.5 py-2 transition-colors"
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        CHAIN_COLORS[fromChainId] ??
                        "bg-white/10 text-gray-300 border-white/10"
                      }`}
                    >
                      {fromToken.symbol.slice(0, 1)}
                    </div>
                    <span className="text-xs font-semibold text-white">
                      {fromToken.symbol}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-white/5">
                  <span className="text-[11px] text-gray-500">
                    {LIFI_CHAINS.find((c) => c.id === fromChainId)?.name ?? ""}{" "}
                    · Balance
                  </span>
                  <button
                    type="button"
                    onClick={handleMax}
                    className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 active:opacity-80"
                  >
                    {fromToken.symbol === "ETH" || fromToken.symbol === "AVAX"
                      ? balanceLoading
                        ? "…"
                        : `${effectiveBalance.toFixed(6)} ${fromToken.symbol} Max`
                      : "—"}
                  </button>
                </div>
              </div>

              <div className="flex justify-center my-3 relative z-10">
                <div className="rounded-full bg-gray-900 border-2 border-gray-800 shadow-inner p-2">
                  <ArrowDownUp className="w-5 h-5 text-emerald-500/80" />
                </div>
              </div>

              {/* To */}
              <div className="mb-3 p-2 rounded-lg bg-white/[0.04] border border-white/10">
                <p className="text-[11px] font-medium text-gray-500 mb-1">
                  To
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 text-lg font-semibold text-white tabular-nums">
                    {quote
                      ? formatTokenAmount(
                          quote.estimate.toAmount,
                          toToken.decimals,
                        )
                      : "0.00"}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTokenSelectorSearch("");
                      setTokenSelectorChainFilter("all");
                      setTokenSelectorMode("to");
                    }}
                    className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-2.5 py-2 transition-colors"
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        CHAIN_COLORS[toChainId] ??
                        "bg-white/10 text-gray-300 border-white/10"
                      }`}
                    >
                      {toToken.symbol.slice(0, 1)}
                    </div>
                    <span className="text-xs font-semibold text-white">
                      {toToken.symbol}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
                {quote && (
                  <p className="text-[11px] text-gray-500 mt-1 pt-1 border-t border-white/5">
                    Min received:{" "}
                    <span className="text-gray-400">
                      {formatTokenAmount(
                        quote.estimate.toAmountMin,
                        toToken.decimals,
                      )}{" "}
                      {toToken.symbol}
                    </span>
                    <span className="text-gray-600"> · slippage</span>
                  </p>
                )}
              </div>

              {/* Token selector sheet (MetaMask-style) */}
              <AnimatePresence>
                {tokenSelectorMode && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setTokenSelectorMode(null)}
                      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                    />
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{
                        type: "spring",
                        damping: 28,
                        stiffness: 300,
                      }}
                      className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-[70] border-t border-white/10 max-h-[75vh] flex flex-col shadow-2xl"
                    >
                      <div className="flex justify-center pt-2.5 pb-1">
                        <div className="w-8 h-0.5 bg-white/20 rounded-full" />
                      </div>
                      <div className="px-4 pb-2 flex items-center justify-between">
                        <h3 className="text-base font-bold text-white">
                          Select token
                        </h3>
                        <button
                          onClick={() => setTokenSelectorMode(null)}
                          className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="px-4 pb-3">
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => setTokenSelectorChainFilter("all")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              tokenSelectorChainFilter === "all"
                                ? "bg-white/15 text-white border border-white/20"
                                : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10"
                            }`}
                          >
                            All
                          </button>
                          {LIFI_CHAINS.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setTokenSelectorChainFilter(c.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                tokenSelectorChainFilter === c.id
                                  ? "bg-white/15 text-white border border-white/20"
                                  : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10"
                              }`}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            type="text"
                            value={tokenSelectorSearch}
                            onChange={(e) =>
                              setTokenSelectorSearch(e.target.value)
                            }
                            placeholder="Search tokens by name or address"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
                        {filteredTokens.length === 0 ? (
                          <p className="text-center text-gray-500 text-sm py-6">
                            No tokens found
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {filteredTokens.map((t) => {
                              const isSelected =
                                tokenSelectorMode === "from"
                                  ? t.chainId === fromChainId &&
                                    t.address === fromTokenAddress
                                  : t.chainId === toChainId &&
                                    t.address === toTokenAddress;
                              return (
                                <button
                                  key={`${t.chainId}-${t.address}`}
                                  type="button"
                                  onClick={() => {
                                    if (tokenSelectorMode === "from") {
                                      setFromChainId(t.chainId as LifiChainId);
                                      setFromTokenAddress(t.address);
                                    } else {
                                      setToChainId(t.chainId as LifiChainId);
                                      setToTokenAddress(t.address);
                                    }
                                    setTokenSelectorMode(null);
                                  }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                                    isSelected
                                      ? "bg-emerald-500/15 border-l-4 border-emerald-500"
                                      : "hover:bg-white/10 border-l-4 border-transparent"
                                  }`}
                                >
                                  <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 ${
                                      CHAIN_COLORS[t.chainId] ??
                                      "bg-white/10 text-gray-300 border-white/10"
                                    }`}
                                  >
                                    {t.symbol.slice(0, 2)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-white">
                                      {t.symbol}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {t.name}
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border ${
                                      CHAIN_COLORS[t.chainId] ??
                                      "bg-white/10 text-gray-400 border-white/10"
                                    }`}
                                  >
                                    {t.chainName}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {quoteLoading && (
                <div className="flex items-center gap-1.5 mb-2 py-1.5 text-gray-400 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Getting quote...</span>
                </div>
              )}
              {quoteError && (
                <div className="mb-2 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-[11px] text-red-400">{quoteError}</p>
                </div>
              )}
              {executeError && (
                <div className="mb-2 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-[11px] text-red-400">{executeError}</p>
                </div>
              )}

              {quote &&
                quote.estimate.gasCosts &&
                quote.estimate.gasCosts.length > 0 && (
                  <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5 text-[11px] text-gray-500">
                    Est. gas:{" "}
                    {quote.estimate.gasCosts
                      .map(
                        (g) =>
                          `${(Number(g.amount) / 10 ** (g.token?.decimals ?? 18)).toFixed(6)} ${g.token?.symbol ?? "ETH"}`,
                      )
                      .join(", ")}
                  </div>
                )}

              <div className="flex flex-col gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (canConfirm) handleExecute();
                  }}
                  disabled={executing}
                  aria-disabled={!canConfirm}
                  className={`relative z-10 w-full py-3 px-4 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all pointer-events-auto ${
                    canConfirm
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98] shadow-lg shadow-emerald-900/20 cursor-pointer"
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
                {!canConfirm && amountNum > 0 && quote && !hasEnoughBalance && (
                  <p className="text-[11px] text-amber-400/90 text-center -mt-1">
                    Insufficient balance
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={executing}
                  className="relative z-10 w-full py-2.5 px-4 font-medium rounded-xl text-sm border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
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
