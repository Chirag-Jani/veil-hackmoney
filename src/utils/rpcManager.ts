/**
 * RPC Manager for Solana
 *
 * Multiple RPCs: pick random RPC per attempt. On failure, retry with a new
 * random RPC up to 3 times.
 */

import { Connection } from "@solana/web3.js";
import { SOLANA_RPCS } from "../config/rpcs";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export interface RPCManagerOptions {
  rpcUrls: string[];
  maxRetries?: number;
  retryDelay?: number;
}

function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("403") ||
    message.includes("rate limit") ||
    message.includes("access forbidden")
  );
}

/**
 * Pick a random index from [0, length) excluding values in excludeSet.
 * If all indices are excluded, returns a random index anyway.
 */
function randomIndexExcluding(length: number, excludeSet: Set<number>): number {
  const allowed = Array.from({ length }, (_, i) => i).filter(
    (i) => !excludeSet.has(i)
  );
  if (allowed.length === 0) {
    return Math.floor(Math.random() * length);
  }
  return allowed[Math.floor(Math.random() * allowed.length)]!;
}

export class RPCManager {
  private readonly rpcUrls: string[];
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly connectionCache: Map<string, Connection> = new Map();

  constructor(options: RPCManagerOptions) {
    if (!options.rpcUrls?.length) {
      throw new Error("At least one RPC URL is required");
    }
    this.rpcUrls = [...options.rpcUrls];
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.retryDelay = options.retryDelay ?? RETRY_DELAY_MS;
  }

  getConnection(url: string): Connection {
    if (!this.connectionCache.has(url)) {
      this.connectionCache.set(url, new Connection(url, "confirmed"));
    }
    return this.connectionCache.get(url)!;
  }

  getCurrentRpcUrl(): string {
    return this.rpcUrls[0]!;
  }

  getRpcUrls(): string[] {
    return [...this.rpcUrls];
  }

  /**
   * Execute with random RPC selection. On failure, retry with a new random RPC
   * up to maxRetries (default 3).
   */
  async executeWithRetry<T>(
    fn: (connection: Connection) => Promise<T>,
    customRetries?: number
  ): Promise<T> {
    const maxAttempts = customRetries ?? this.maxRetries;
    const triedIndices = new Set<number>();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const index = randomIndexExcluding(this.rpcUrls.length, triedIndices);
      triedIndices.add(index);
      const url = this.rpcUrls[index]!;
      const connection = this.getConnection(url);

      try {
        return await fn(connection);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRateLimit = isRateLimitError(lastError);
        const delay =
          (isRateLimit ? this.retryDelay * 3 : this.retryDelay) *
            Math.pow(2, attempt) +
          Math.random() * 1000;

        if (attempt < maxAttempts - 1) {
          console.warn(
            `[RPCManager] Attempt ${
              attempt + 1
            } failed on ${url}, retrying in ${Math.round(
              delay / 1000
            )}s (next: new random RPC)`
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Failed after all retries");
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.executeWithRetry((c) => c.getSlot(), 1);
      return true;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.connectionCache.clear();
  }
}

const DEFAULT_SOLANA_RPCS = [...SOLANA_RPCS];

export function createRPCManager(): RPCManager {
  const urls = DEFAULT_SOLANA_RPCS;
  return new RPCManager({ rpcUrls: urls });
}
