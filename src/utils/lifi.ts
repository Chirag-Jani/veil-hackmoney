/**
 * LI.FI integration for swap and bridge (EVM).
 * Uses REST API https://li.quest/v1
 */

import { getEthRpcUrl } from "./ethRpcManager";

const LIFI_API = "https://li.quest/v1";

/** Public RPCs for chains other than Ethereum (mainnet uses ethRpcManager). Only these 3 EVM. */
const CHAIN_RPC: Record<number, string> = {
  1: "", // filled by getRpcUrlForChain
  43114: "https://api.avax.network/ext/bc/C/rpc",
  42161: "https://arb1.arbitrum.io/rpc",
};

export function getRpcUrlForChain(chainId: number): string {
  if (chainId === 1) return getEthRpcUrl();
  return CHAIN_RPC[chainId] ?? getEthRpcUrl();
}

export const LIFI_CHAINS = [
  { id: 1, name: "Ethereum", key: "eth" },
  { id: 43114, name: "Avalanche", key: "avax" },
  { id: 42161, name: "Arbitrum", key: "arb" },
] as const;

export type LifiChainId = (typeof LIFI_CHAINS)[number]["id"];

export const LIFI_TOKENS_BY_CHAIN: Record<
  number,
  { address: string; symbol: string; decimals: number; name: string }[]
> = {
  1: [
    { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", decimals: 18, name: "Ethereum" },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, name: "USD Coin" },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, name: "Tether USD" },
  ],
  43114: [
    { address: "0x0000000000000000000000000000000000000000", symbol: "AVAX", decimals: 18, name: "Avalanche" },
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6, name: "USD Coin" },
  ],
  42161: [
    { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", decimals: 18, name: "Arbitrum" },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6, name: "USD Coin" },
  ],
};

export interface LifiQuoteEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress?: string;
  gasCosts?: Array<{
    type: string;
    amount: string;
    amountUSD?: string;
    token: { symbol: string; decimals: number; address: string };
  }>;
}

export interface LifiTransactionRequest {
  from: string;
  to: string;
  chainId: number;
  data: string;
  value: string;
  gasPrice?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface LifiQuote {
  id: string;
  type: string;
  tool: string;
  toolDetails?: { name: string; logoURI?: string };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: { address: string; symbol: string; decimals: number; name: string };
    toToken: { address: string; symbol: string; decimals: number; name: string };
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
    slippage: number;
  };
  estimate: LifiQuoteEstimate;
  transactionRequest: LifiTransactionRequest;
}

export interface GetQuoteParams {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmountWei: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
}

export async function getLifiQuote(params: GetQuoteParams): Promise<LifiQuote | null> {
  const {
    fromChainId,
    toChainId,
    fromToken,
    toToken,
    fromAmountWei,
    fromAddress,
    toAddress = fromAddress,
    slippage = 0.005,
  } = params;

  const url = new URL(`${LIFI_API}/quote`);
  url.searchParams.set("fromChain", String(fromChainId));
  url.searchParams.set("toChain", String(toChainId));
  url.searchParams.set("fromToken", fromToken);
  url.searchParams.set("toToken", toToken);
  url.searchParams.set("fromAmount", fromAmountWei);
  url.searchParams.set("fromAddress", fromAddress);
  url.searchParams.set("toAddress", toAddress);
  url.searchParams.set("slippage", String(slippage));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `LI.FI quote failed: ${res.status}`);
  }
  const data = await res.json();

  if (!data || !data.transactionRequest) {
    return null;
  }
  return data as LifiQuote;
}

export function getTokensForChain(chainId: number) {
  return LIFI_TOKENS_BY_CHAIN[chainId] ?? LIFI_TOKENS_BY_CHAIN[1]!;
}

export function getChainById(chainId: number) {
  return LIFI_CHAINS.find((c) => c.id === chainId);
}

// --- Advanced routes (multi-step / Composer) ---

export interface LifiRouteToken {
  address: string;
  symbol: string;
  decimals: number;
  chainId?: number;
  name?: string;
}

export interface LifiStepAction {
  fromChainId: number;
  toChainId: number;
  fromToken: LifiRouteToken;
  toToken: LifiRouteToken;
  fromAmount: string;
  slippage: number;
  fromAddress?: string;
  toAddress?: string;
}

export interface LifiStepEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress?: string;
  gasCosts?: Array<{
    type: string;
    amount: string;
    amountUSD?: string;
    token: { symbol: string; decimals: number; address: string };
  }>;
}

export interface LifiStep {
  id: string;
  type: "swap" | "cross" | "lifi" | "protocol";
  tool: string;
  toolDetails?: { name: string; logoURI?: string };
  action: LifiStepAction;
  estimate: LifiStepEstimate;
  data?: unknown;
  integrator?: string;
}

export interface LifiStepWithTransaction extends LifiStep {
  transactionRequest: LifiTransactionRequest;
}

export interface LifiRoute {
  id: string;
  fromChainId: number;
  fromAmount: string;
  fromToken: LifiRouteToken;
  toChainId: number;
  toAmount: string;
  toAmountMin: string;
  toToken: LifiRouteToken;
  gasCostUSD?: string;
  steps: LifiStep[];
}

export interface GetRoutesParams {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
}

const INTEGRATOR = "veil";

export async function getLifiRoutes(
  params: GetRoutesParams,
): Promise<{ routes: LifiRoute[] }> {
  const {
    fromChainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    fromAddress,
    toAddress = fromAddress,
    slippage = 0.005,
  } = params;

  const res = await fetch(`${LIFI_API}/advanced/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromChainId,
      toChainId,
      fromTokenAddress,
      toTokenAddress,
      fromAmount,
      fromAddress,
      toAddress,
      options: {
        slippage,
        integrator: INTEGRATOR,
        allowSwitchChain: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `LI.FI routes failed: ${res.status}`);
  }

  const data = (await res.json()) as { routes?: LifiRoute[] };
  const routes = data.routes ?? [];
  return { routes };
}

/** Get transaction payload for one step. Call once per step; for multi-step, call after previous step is confirmed. */
export async function getStepTransaction(
  step: LifiStep,
  options: { fromAddress: string; toAddress?: string },
): Promise<LifiStepWithTransaction> {
  const { fromAddress, toAddress = fromAddress } = options;
  const stepWithAddresses: LifiStep = {
    ...step,
    action: {
      ...step.action,
      fromAddress,
      toAddress,
    },
  };

  const res = await fetch(`${LIFI_API}/advanced/stepTransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...stepWithAddresses,
      integrator: step.integrator ?? INTEGRATOR,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `LI.FI stepTransaction failed: ${res.status}`);
  }

  const data = (await res.json()) as LifiStepWithTransaction;
  if (!data.transactionRequest) {
    throw new Error("LI.FI stepTransaction did not return transactionRequest");
  }
  return data;
}
