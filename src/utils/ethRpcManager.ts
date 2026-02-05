/**
 * Ethereum RPC manager: multiple RPCs, random pick per attempt,
 * retry with a new RPC on failure up to 3 times.
 * Also provides Arbitrum balance fetching for second EVM chain.
 */

import {
  ARBITRUM_RPCS,
  AVALANCHE_RPCS,
  ETHEREUM_RPCS,
} from "../config/rpcs";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;
const DEFAULT_ETH_RPCS = [...ETHEREUM_RPCS];

function randomIndexExcluding(length: number, exclude: Set<number>): number {
  const allowed = Array.from({ length }, (_, i) => i).filter(
    (i) => !exclude.has(i)
  );
  if (allowed.length === 0) return Math.floor(Math.random() * length);
  return allowed[Math.floor(Math.random() * allowed.length)]!;
}

export interface EthRPCManagerOptions {
  rpcUrls: string[];
  maxRetries?: number;
  retryDelay?: number;
}

export class EthRPCManager {
  private readonly rpcUrls: string[];
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(options: EthRPCManagerOptions) {
    if (!options.rpcUrls?.length) {
      throw new Error("At least one Ethereum RPC URL is required");
    }
    this.rpcUrls = [...options.rpcUrls];
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.retryDelay = options.retryDelay ?? RETRY_DELAY_MS;
  }

  getRpcUrls(): string[] {
    return [...this.rpcUrls];
  }

  /**
   * Execute a function with a single RPC URL. Picks random RPC per attempt;
   * on failure, retries with a new random RPC up to maxRetries (default 3).
   */
  async executeWithRetry<T>(fn: (rpcUrl: string) => Promise<T>): Promise<T> {
    const tried = new Set<number>();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const index = randomIndexExcluding(this.rpcUrls.length, tried);
      tried.add(index);
      const url = this.rpcUrls[index]!;

      try {
        return await fn(url);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries - 1) {
          const delay =
            this.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.warn(
            `[EthRPCManager] Attempt ${
              attempt + 1
            } failed on ${url}, retrying in ${Math.round(delay / 1000)}s`
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Failed after all retries");
  }
}

let ethManagerInstance: EthRPCManager | null = null;

export function getEthRPCManager(): EthRPCManager {
  if (!ethManagerInstance) {
    const urls = DEFAULT_ETH_RPCS;
    ethManagerInstance = new EthRPCManager({ rpcUrls: urls });
  }
  return ethManagerInstance;
}

export function createEthRPCManager(): EthRPCManager {
  return new EthRPCManager({ rpcUrls: DEFAULT_ETH_RPCS });
}

/** Single URL for legacy callers (e.g. JsonRpcProvider). Prefer executeWithRetry for operations. */
export function getEthRpcUrl(): string {
  return getEthRPCManager().getRpcUrls()[0] ?? DEFAULT_ETH_RPCS[0]!;
}

/**
 * Fetch ETH balance (in wei) with retry across multiple RPCs.
 */
export async function getEthBalance(address: string): Promise<bigint> {
  return getEthRPCManager().executeWithRetry(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) throw new Error(`Ethereum RPC error: ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      error?: { message: string };
    };
    if (data.error) {
      throw new Error(data.error.message || "eth_getBalance failed");
    }
    const hex = data.result;
    if (typeof hex !== "string")
      throw new Error("Invalid eth_getBalance result");
    return BigInt(hex);
  });
}

export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

let arbitrumManagerInstance: EthRPCManager | null = null;

export function getArbitrumRPCManager(): EthRPCManager {
  if (!arbitrumManagerInstance) {
    arbitrumManagerInstance = new EthRPCManager({
      rpcUrls: [...ARBITRUM_RPCS],
    });
  }
  return arbitrumManagerInstance;
}

/**
 * Fetch ETH balance on Arbitrum (in wei) with retry across multiple RPCs.
 */
export async function getArbitrumBalance(address: string): Promise<bigint> {
  return getArbitrumRPCManager().executeWithRetry(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) throw new Error(`Arbitrum RPC error: ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      error?: { message: string };
    };
    if (data.error) {
      throw new Error(data.error.message || "eth_getBalance failed");
    }
    const hex = data.result;
    if (typeof hex !== "string")
      throw new Error("Invalid eth_getBalance result");
    return BigInt(hex);
  });
}

let avalancheManagerInstance: EthRPCManager | null = null;

export function getAvalancheRPCManager(): EthRPCManager {
  if (!avalancheManagerInstance) {
    avalancheManagerInstance = new EthRPCManager({
      rpcUrls: [...AVALANCHE_RPCS],
    });
  }
  return avalancheManagerInstance;
}

/**
 * Fetch AVAX balance on Avalanche C-Chain (in wei) with retry.
 */
export async function getAvalancheBalance(address: string): Promise<bigint> {
  return getAvalancheRPCManager().executeWithRetry(async (url) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    if (!res.ok) throw new Error(`Avalanche RPC error: ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      error?: { message: string };
    };
    if (data.error) {
      throw new Error(data.error.message || "eth_getBalance failed");
    }
    const hex = data.result;
    if (typeof hex !== "string")
      throw new Error("Invalid eth_getBalance result");
    return BigInt(hex);
  });
}
