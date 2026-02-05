/**
 * Key Management utilities for Veil wallet
 * Handles BIP39 mnemonic generation, seed derivation, Solana and Ethereum keypair management
 */

import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import englishWordlist from "bip39/src/wordlists/english.json";
import bs58 from "bs58";
import { HDNodeWallet, Wallet } from "ethers";
import type { NetworkType } from "../types";
import { decrypt, encrypt } from "./crypto";

// Import ed25519-hd-key using namespace import to handle CommonJS
import * as ed25519HdKeyModule from "ed25519-hd-key";

// Extract derivePath - handle CommonJS exports
const getDerivePath = () => {
  // CommonJS modules often export as default or as namespace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = ed25519HdKeyModule as any;

  // Try different access patterns
  if (mod.derivePath && typeof mod.derivePath === "function") {
    return mod.derivePath;
  }
  if (mod.default?.derivePath && typeof mod.default.derivePath === "function") {
    return mod.default.derivePath;
  }
  if (mod.default && typeof mod.default === "function") {
    return mod.default;
  }

  // Log for debugging
  console.error("[Veil] ed25519-hd-key module structure:", {
    hasDerivePath: !!mod.derivePath,
    hasDefault: !!mod.default,
    keys: Object.keys(mod),
    modType: typeof mod,
  });

  return null;
};

/**
 * Convert Uint8Array to hex string (browser-compatible)
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Convert hex string to Uint8Array (browser-compatible)
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Storage keys (burner index and retired are per-network: suffix :solana or :ethereum)
const STORAGE_KEYS = {
  ENCRYPTED_SEED: "veil:encrypted_seed",
  ENCRYPTED_SALT: "veil:encrypted_salt",
  ENCRYPTED_IV: "veil:encrypted_iv",
  BURNER_INDEX: "veil:burner_index",
  RETIRED_BURNERS: "veil:retired_burners",
  IMPORTED_PRIVATE_KEY: "veil:imported_private_key",
  IMPORTED_PK_SALT: "veil:imported_pk_salt",
  IMPORTED_PK_IV: "veil:imported_pk_iv",
  IMPORTED_ETH_PRIVATE_KEY: "veil:imported_eth_private_key",
  IMPORTED_ETH_PK_SALT: "veil:imported_eth_pk_salt",
  IMPORTED_ETH_PK_IV: "veil:imported_eth_pk_iv",
  IMPORT_TYPE: "veil:import_type",
  /** List of Solana wallet indices that use an imported key (not derived). */
  IMPORTED_SOLANA_INDICES: "veil:imported_solana_indices",
} as const;

function importedSolanaPkKey(index: number): string {
  return `veil:imported_solana_pk_${index}`;
}
function importedSolanaSaltKey(index: number): string {
  return `veil:imported_solana_salt_${index}`;
}
function importedSolanaIvKey(index: number): string {
  return `veil:imported_solana_iv_${index}`;
}

const EVM_NETWORKS: NetworkType[] = ["ethereum", "avalanche", "arbitrum"];
function evmCanonical(network: NetworkType): NetworkType {
  return EVM_NETWORKS.includes(network) ? "ethereum" : network;
}

function burnerIndexKey(network: NetworkType): string {
  return `${STORAGE_KEYS.BURNER_INDEX}:${evmCanonical(network)}`;
}
function retiredBurnersKey(network: NetworkType): string {
  return `${STORAGE_KEYS.RETIRED_BURNERS}:${evmCanonical(network)}`;
}

/**
 * Generate a new BIP39 mnemonic phrase (12 words)
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128, undefined, englishWordlist);
}

/**
 * Validate a mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, englishWordlist);
}

/**
 * Detect private key format: Solana (base58 or byte array) or Ethereum (hex)
 */
export function getPrivateKeyFormat(privateKey: string): "solana" | "ethereum" {
  const trimmed = privateKey.trim();
  if (trimmed.startsWith("0x") && /^0x[0-9a-fA-F]{64}$/.test(trimmed))
    return "ethereum";
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return "ethereum";
  return "solana";
}

/**
 * Validate a private key (Solana: base58 or byte array; Ethereum: 64-char hex with optional 0x)
 */
export function validatePrivateKey(privateKey: string): boolean {
  const trimmed = privateKey.trim();

  // Ethereum: 64 hex chars, optional 0x prefix
  if (trimmed.startsWith("0x") && /^0x[0-9a-fA-F]{64}$/.test(trimmed))
    return true;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return true;

  // Solana: base58 or byte array (64 or 32 bytes; 65/33 with version byte allowed)
  try {
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const bytes = JSON.parse(trimmed);
      if (!Array.isArray(bytes)) return false;
      const len = bytes.length;
      return len === 64 || len === 32 || len === 65 || len === 33;
    }
    const decoded = bs58.decode(trimmed);
    const len = decoded.length;
    return len === 64 || len === 32 || len === 65 || len === 33;
  } catch {
    return false;
  }
}

/**
 * Normalize secret key bytes for Solana Keypair.fromSecretKey.
 * Expects 64 bytes (seed+public) or 32 bytes (seed only). Handles extra version byte if present.
 */
function normalizeSolanaSecretKey(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 64 || bytes.length === 32) return bytes;
  if (bytes.length === 65) return bytes.slice(0, 64); // drop trailing version byte if present
  if (bytes.length === 33) return bytes.slice(1, 33);  // drop leading version byte
  throw new Error(
    `Invalid Solana secret key length: ${bytes.length} (expected 32 or 64 bytes)`
  );
}

/**
 * Convert private key string to Keypair (Phantom / Solana standard).
 * Supports: base58 (64 or 32 bytes), JSON array [n,n,...].
 */
export function privateKeyToKeypair(privateKey: string): Keypair {
  const trimmed = privateKey.trim().replace(/\s/g, "");

  // JSON array format (e.g. from Solana CLI or some exports)
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const bytes = JSON.parse(trimmed);
    const arr = new Uint8Array(bytes);
    const secretKey = normalizeSolanaSecretKey(arr);
    return Keypair.fromSecretKey(secretKey);
  }

  // Base58 (Phantom export format)
  const decoded = bs58.decode(trimmed);
  const secretKey = normalizeSolanaSecretKey(new Uint8Array(decoded));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Convert private key to a seed for HD derivation (for burner wallets)
 * Uses the first 32 bytes of the secret key as seed
 * Note: Index 0 will use the original keypair, not HD derivation
 */
export function privateKeyToSeed(privateKey: string): Uint8Array {
  const keypair = privateKeyToKeypair(privateKey);
  // Use the secret key seed (first 32 bytes) and pad to 64 bytes for HD derivation
  const seedPart = keypair.secretKey.slice(0, 32);
  return expandSeedTo64(seedPart);
}

/**
 * Normalize Ethereum private key (hex, with or without 0x) to 32 bytes
 */
function normalizeEthPrivateKey(hex: string): Uint8Array {
  const trimmed = hex.trim().replace(/^0x/, "");
  if (trimmed.length !== 64) throw new Error("Ethereum private key must be 64 hex chars (32 bytes)");
  return hexToUint8Array(trimmed);
}

/**
 * Expand 32-byte seed to 64 bytes for HD derivation (same expansion as Solana path)
 */
function expandSeedTo64(seedPart: Uint8Array): Uint8Array {
  if (seedPart.length !== 32) throw new Error("Seed part must be 32 bytes");
  const seed = new Uint8Array(64);
  seed.set(seedPart, 0);
  for (let i = 0; i < 32; i++) {
    seed[32 + i] = seedPart[i] ^ 0x5c;
  }
  return seed;
}

/**
 * Convert Ethereum private key (hex) to 64-byte seed for HD derivation of burners.
 * Index 0 ETH will use the imported key; SOL and ETH burners derive from this seed.
 */
export function ethPrivateKeyToSeed(ethPrivateKey: string): Uint8Array {
  const seedPart = normalizeEthPrivateKey(ethPrivateKey);
  return expandSeedTo64(seedPart);
}

/**
 * Store the original imported private key (encrypted)
 * This is used to return the exact same keypair for index 0
 */
export async function storeImportedPrivateKey(
  privateKey: string,
  password: string
): Promise<void> {
  const keypair = privateKeyToKeypair(privateKey);
  const secretKeyHex = uint8ArrayToHex(keypair.secretKey);
  const { encrypted, salt, iv } = await encrypt(secretKeyHex, password);

  await chrome.storage.local.set({
    [STORAGE_KEYS.IMPORTED_PRIVATE_KEY]: encrypted,
    [STORAGE_KEYS.IMPORTED_PK_SALT]: salt,
    [STORAGE_KEYS.IMPORTED_PK_IV]: iv,
    [STORAGE_KEYS.IMPORT_TYPE]: "privateKey",
  });
  await chrome.storage.local.remove([
    STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_ETH_PK_SALT,
    STORAGE_KEYS.IMPORTED_ETH_PK_IV,
  ]);
}

/**
 * Store the original imported Ethereum private key (encrypted) for index 0
 */
export async function storeImportedEthereumPrivateKey(
  privateKey: string,
  password: string
): Promise<void> {
  const normalized = normalizeEthPrivateKey(privateKey);
  const hex = uint8ArrayToHex(normalized);
  const { encrypted, salt, iv } = await encrypt(hex, password);

  await chrome.storage.local.set({
    [STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY]: encrypted,
    [STORAGE_KEYS.IMPORTED_ETH_PK_SALT]: salt,
    [STORAGE_KEYS.IMPORTED_ETH_PK_IV]: iv,
    [STORAGE_KEYS.IMPORT_TYPE]: "privateKeyEth",
  });
  await chrome.storage.local.remove([
    STORAGE_KEYS.IMPORTED_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_PK_SALT,
    STORAGE_KEYS.IMPORTED_PK_IV,
  ]);
}

/**
 * Get the imported private key keypair (for index 0) — Solana only (legacy)
 */
export async function getImportedKeypair(
  password: string
): Promise<Keypair | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.IMPORTED_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_PK_SALT,
    STORAGE_KEYS.IMPORTED_PK_IV,
    STORAGE_KEYS.IMPORT_TYPE,
  ]);

  if (
    result[STORAGE_KEYS.IMPORT_TYPE] !== "privateKey" ||
    !result[STORAGE_KEYS.IMPORTED_PRIVATE_KEY]
  ) {
    return null;
  }

  try {
    const secretKeyHex = await decrypt(
      result[STORAGE_KEYS.IMPORTED_PRIVATE_KEY],
      result[STORAGE_KEYS.IMPORTED_PK_SALT],
      result[STORAGE_KEYS.IMPORTED_PK_IV],
      password
    );
    const secretKey = hexToUint8Array(secretKeyHex);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error("[Veil] Error decrypting imported keypair:", error);
    return null;
  }
}

/**
 * Store an imported Solana private key for a specific wallet index.
 * Allows multiple imported Solana wallets (e.g. index 0 derived, index 1 imported).
 */
export async function storeImportedSolanaKeyForIndex(
  privateKey: string,
  password: string,
  index: number
): Promise<void> {
  const keypair = privateKeyToKeypair(privateKey);
  const secretKeyHex = uint8ArrayToHex(keypair.secretKey);
  const { encrypted, salt, iv } = await encrypt(secretKeyHex, password);

  const indicesResult = await chrome.storage.local.get(
    STORAGE_KEYS.IMPORTED_SOLANA_INDICES,
  );
  const indices: number[] =
    Array.isArray(indicesResult[STORAGE_KEYS.IMPORTED_SOLANA_INDICES])
      ? indicesResult[STORAGE_KEYS.IMPORTED_SOLANA_INDICES]
      : [];
  if (!indices.includes(index)) {
    indices.push(index);
    indices.sort((a, b) => a - b);
    await chrome.storage.local.set({
      [STORAGE_KEYS.IMPORTED_SOLANA_INDICES]: indices,
    });
  }

  await chrome.storage.local.set({
    [importedSolanaPkKey(index)]: encrypted,
    [importedSolanaSaltKey(index)]: salt,
    [importedSolanaIvKey(index)]: iv,
  });
}

/**
 * Get imported Solana keypair for a given index, if one is stored.
 */
export async function getImportedSolanaKeypairForIndex(
  password: string,
  index: number
): Promise<Keypair | null> {
  const result = await chrome.storage.local.get([
    importedSolanaPkKey(index),
    importedSolanaSaltKey(index),
    importedSolanaIvKey(index),
  ]);
  const encrypted = result[importedSolanaPkKey(index)];
  const salt = result[importedSolanaSaltKey(index)];
  const iv = result[importedSolanaIvKey(index)];
  if (!encrypted || !salt || !iv) return null;

  try {
    const secretKeyHex = await decrypt(encrypted, salt, iv, password);
    const secretKey = hexToUint8Array(secretKeyHex);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error("[Veil] Error decrypting imported Solana key for index", index, error);
    return null;
  }
}

/**
 * Get the imported Ethereum private key (for index 0)
 */
export async function getImportedEthereumPrivateKey(
  password: string
): Promise<string | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_ETH_PK_SALT,
    STORAGE_KEYS.IMPORTED_ETH_PK_IV,
    STORAGE_KEYS.IMPORT_TYPE,
  ]);

  if (
    result[STORAGE_KEYS.IMPORT_TYPE] !== "privateKeyEth" ||
    !result[STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY]
  ) {
    return null;
  }

  try {
    const hex = await decrypt(
      result[STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY],
      result[STORAGE_KEYS.IMPORTED_ETH_PK_SALT],
      result[STORAGE_KEYS.IMPORTED_ETH_PK_IV],
      password
    );
    return hex.startsWith("0x") ? hex : `0x${hex}`;
  } catch (error) {
    console.error("[Veil] Error decrypting imported ETH key:", error);
    return null;
  }
}

/**
 * Check if wallet was imported via private key (Solana or Ethereum)
 */
export async function isPrivateKeyImport(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_TYPE);
  const t = result[STORAGE_KEYS.IMPORT_TYPE];
  return t === "privateKey" || t === "privateKeyEth";
}

/**
 * Set import type to seed (for seed phrase restores)
 */
export async function setImportTypeSeed(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.IMPORT_TYPE]: "seed",
  });
  await chrome.storage.local.remove([
    STORAGE_KEYS.IMPORTED_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_PK_SALT,
    STORAGE_KEYS.IMPORTED_PK_IV,
    STORAGE_KEYS.IMPORTED_ETH_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_ETH_PK_SALT,
    STORAGE_KEYS.IMPORTED_ETH_PK_IV,
  ]);
}

/**
 * Convert mnemonic to seed (64 bytes)
 */
export async function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  const seedBuffer = await bip39.mnemonicToSeed(mnemonic);
  const seed = new Uint8Array(seedBuffer);
  return seed;
}

/**
 * Derive a Solana keypair from a seed using HD wallet derivation
 * Uses the path: m/44'/501'/index'/0'
 * - 44' = BIP44 standard
 * - 501' = Solana coin type
 * - index' = Burner wallet index
 * - 0' = Account index
 */
export function deriveKeypairFromSeed(
  seed: Uint8Array,
  index: number
): Keypair {
  try {
    // Solana uses Ed25519 derivation path: m/44'/501'/index'/0'
    const path = `m/44'/501'/${index}'/0'`;
    const seedHex = uint8ArrayToHex(seed);

    if (!seedHex || seedHex.length === 0) {
      throw new Error("Invalid seed: seed is empty");
    }

    // Get derivePath function
    const derivePathFn = getDerivePath();

    if (!derivePathFn || typeof derivePathFn !== "function") {
      console.error("[Veil] ed25519-hd-key module structure:", {
        module: ed25519HdKeyModule,
        keys: ed25519HdKeyModule ? Object.keys(ed25519HdKeyModule) : "null",
        type: typeof ed25519HdKeyModule,
      });
      throw new Error(
        "derivePath function not found in ed25519-hd-key library. Module may not be loaded correctly."
      );
    }

    const derived = derivePathFn(path, seedHex);
    if (!derived || !derived.key) {
      throw new Error("Failed to derive key from seed");
    }

    // Convert Buffer to Uint8Array
    let keyBytes: Uint8Array;
    if (derived.key instanceof Uint8Array) {
      keyBytes = derived.key;
    } else if (
      derived.key &&
      typeof derived.key === "object" &&
      "length" in derived.key
    ) {
      // Handle Buffer-like object
      keyBytes = new Uint8Array(derived.key);
    } else {
      throw new Error("Invalid key format from derivation");
    }

    if (keyBytes.length !== 32) {
      throw new Error(
        `Invalid key length: expected 32 bytes, got ${keyBytes.length}`
      );
    }

    return Keypair.fromSeed(keyBytes);
  } catch (error) {
    console.error("[Veil] Error deriving keypair:", error);
    throw new Error(
      `Failed to derive keypair: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Derive the master keypair (index 0) from seed
 */
export function deriveMasterKeypair(seed: Uint8Array): Keypair {
  return deriveKeypairFromSeed(seed, 0);
}

/**
 * Encrypt and store the master seed
 */
export async function storeEncryptedSeed(
  seed: Uint8Array,
  password: string
): Promise<void> {
  const seedHex = uint8ArrayToHex(seed);
  const { encrypted, salt, iv } = await encrypt(seedHex, password);

  await chrome.storage.local.set({
    [STORAGE_KEYS.ENCRYPTED_SEED]: encrypted,
    [STORAGE_KEYS.ENCRYPTED_SALT]: salt,
    [STORAGE_KEYS.ENCRYPTED_IV]: iv,
  });
}

/**
 * Retrieve and decrypt the master seed
 */
export async function getDecryptedSeed(password: string): Promise<Uint8Array> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ENCRYPTED_SEED,
    STORAGE_KEYS.ENCRYPTED_SALT,
    STORAGE_KEYS.ENCRYPTED_IV,
  ]);

  if (!result[STORAGE_KEYS.ENCRYPTED_SEED]) {
    throw new Error(
      "No encrypted seed found. Please create or restore a wallet."
    );
  }

  const seedHex = await decrypt(
    result[STORAGE_KEYS.ENCRYPTED_SEED],
    result[STORAGE_KEYS.ENCRYPTED_SALT],
    result[STORAGE_KEYS.ENCRYPTED_IV],
    password
  );

  return hexToUint8Array(seedHex);
}

/**
 * Check if a wallet exists (encrypted seed is stored)
 */
export async function hasWallet(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_SEED);
  return !!result[STORAGE_KEYS.ENCRYPTED_SEED];
}

/**
 * Get the next burner wallet index for a network. EVM chains share one index.
 */
export async function getNextBurnerIndex(
  network: NetworkType
): Promise<number> {
  const key = burnerIndexKey(evmCanonical(network));
  const result = await chrome.storage.local.get(key);
  const currentIndex = result[key];
  if (typeof currentIndex === "number" && Number.isInteger(currentIndex)) {
    return currentIndex;
  }
  // Legacy: old key without network suffix = Solana
  if (network === "solana") {
    const legacy = await chrome.storage.local.get(STORAGE_KEYS.BURNER_INDEX);
    return (legacy[STORAGE_KEYS.BURNER_INDEX] as number) || 0;
  }
  return 0;
}

/**
 * Increment and save the burner wallet index. EVM chains share one index.
 */
export async function incrementBurnerIndex(
  network: NetworkType
): Promise<number> {
  const currentIndex = await getNextBurnerIndex(network);
  const nextIndex = currentIndex + 1;
  await chrome.storage.local.set({ [burnerIndexKey(evmCanonical(network))]: nextIndex });
  return nextIndex;
}

/**
 * Get list of retired burner indices for a network
 */
export async function getRetiredBurners(
  network: NetworkType
): Promise<number[]> {
  const key = retiredBurnersKey(network);
  const result = await chrome.storage.local.get(key);
  const arr = result[key];
  if (Array.isArray(arr)) return arr;
  if (network === "solana") {
    const legacy = await chrome.storage.local.get(STORAGE_KEYS.RETIRED_BURNERS);
    return (legacy[STORAGE_KEYS.RETIRED_BURNERS] as number[]) || [];
  }
  return [];
}

/**
 * Mark a burner as retired for a network
 */
export async function retireBurner(
  index: number,
  network: NetworkType
): Promise<void> {
  const retired = await getRetiredBurners(network);
  if (!retired.includes(index)) {
    retired.push(index);
    await chrome.storage.local.set({ [retiredBurnersKey(network)]: retired });
  }
}

/**
 * Derive Ethereum address and private key from BIP39 seed (64 bytes) and index.
 * Path: m/44'/60'/0'/0/index
 */
export function deriveEthereumWalletFromSeed(
  seed: Uint8Array,
  index: number
): { address: string; privateKey: string } {
  if (seed.length !== 64) {
    throw new Error("Ethereum derivation requires 64-byte BIP39 seed");
  }
  const root = HDNodeWallet.fromSeed(seed);
  const path = `m/44'/60'/0'/0/${index}`;
  const child = root.derivePath(path);
  return { address: child.address, privateKey: child.privateKey };
}

/**
 * Generate a new burner wallet keypair. EVM chains share the same wallet set (same index = same address on all EVM).
 */
export async function generateBurnerKeypair(
  seed: Uint8Array,
  network: NetworkType
): Promise<
  | { keypair: Keypair; index: number }
  | { address: string; privateKey: string; index: number }
> {
  const canonical = evmCanonical(network);
  const retired = await getRetiredBurners(canonical);
  let index = await getNextBurnerIndex(canonical);

  while (retired.includes(index)) {
    index = await incrementBurnerIndex(canonical);
  }

  await incrementBurnerIndex(canonical);

  if (network === "solana") {
    const keypair = deriveKeypairFromSeed(seed, index);
    return { keypair, index };
  }
  const eth = deriveEthereumWalletFromSeed(seed, index);
  return { address: eth.address, privateKey: eth.privateKey, index };
}

/**
 * Recover a burner wallet keypair from seed and index
 */
export function recoverBurnerKeypair(seed: Uint8Array, index: number): Keypair {
  return deriveKeypairFromSeed(seed, index);
}

/**
 * Get Solana keypair for a wallet index.
 * Checks per-index imported key first, then legacy index-0 imported, then derives from seed.
 */
export async function getKeypairForIndex(
  password: string,
  index: number
): Promise<Keypair> {
  const perIndex = await getImportedSolanaKeypairForIndex(password, index);
  if (perIndex) return perIndex;
  if (index === 0) {
    const legacy = await getImportedKeypair(password);
    if (legacy) return legacy;
  }
  const seed = await getDecryptedSeed(password);
  return deriveKeypairFromSeed(seed, index);
}

/**
 * Get Ethereum wallet (address + privateKey) for a wallet index
 */
export async function getEthereumWalletForIndex(
  password: string,
  index: number
): Promise<{ address: string; privateKey: string }> {
  if (index === 0) {
    const importedPk = await getImportedEthereumPrivateKey(password);
    if (importedPk) {
      const wallet = new Wallet(importedPk);
      return { address: wallet.address, privateKey: importedPk };
    }
  }
  const seed = await getDecryptedSeed(password);
  return deriveEthereumWalletFromSeed(seed, index);
}
