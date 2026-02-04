/**
 * Key Management utilities for Veil wallet
 * Handles BIP39 mnemonic generation, seed derivation, Solana and Ethereum keypair management
 */

import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import englishWordlist from "bip39/src/wordlists/english.json";
import bs58 from "bs58";
import { HDNodeWallet } from "ethers";
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
  IMPORT_TYPE: "veil:import_type",
} as const;

function burnerIndexKey(network: NetworkType): string {
  return `${STORAGE_KEYS.BURNER_INDEX}:${network}`;
}
function retiredBurnersKey(network: NetworkType): string {
  return `${STORAGE_KEYS.RETIRED_BURNERS}:${network}`;
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
 * Validate a private key (base58 or byte array format)
 * Solana private keys are 64 bytes (32 seed + 32 public key)
 * or 32 bytes (seed only)
 */
export function validatePrivateKey(privateKey: string): boolean {
  try {
    const trimmed = privateKey.trim();

    // Try to parse as JSON array (byte array format from Phantom export)
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const bytes = JSON.parse(trimmed);
      if (!Array.isArray(bytes)) return false;
      // Accept 64 bytes (full keypair) or 32 bytes (seed only)
      return bytes.length === 64 || bytes.length === 32;
    }

    // Try to parse as base58 string (Phantom export format)
    const decoded = bs58.decode(trimmed);
    return decoded.length === 64 || decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Convert private key string to Keypair
 */
export function privateKeyToKeypair(privateKey: string): Keypair {
  const trimmed = privateKey.trim();

  // Try to parse as JSON array (byte array format)
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const bytes = JSON.parse(trimmed);
    const secretKey = new Uint8Array(bytes);
    return Keypair.fromSecretKey(secretKey);
  }

  // Parse as base58 string (Phantom export format)
  const decoded = bs58.decode(trimmed);
  return Keypair.fromSecretKey(new Uint8Array(decoded));
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

  // Create a 64-byte seed by hashing/expanding the 32-byte seed
  // This is needed for HD derivation which expects 64 bytes
  const seed = new Uint8Array(64);
  seed.set(seedPart, 0);
  // For the second half, we XOR with a constant to differentiate
  for (let i = 0; i < 32; i++) {
    seed[32 + i] = seedPart[i] ^ 0x5c; // HMAC-style expansion
  }

  return seed;
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
}

/**
 * Get the imported private key keypair (for index 0)
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
 * Check if wallet was imported via private key
 */
export async function isPrivateKeyImport(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_TYPE);
  return result[STORAGE_KEYS.IMPORT_TYPE] === "privateKey";
}

/**
 * Set import type to seed (for seed phrase restores)
 */
export async function setImportTypeSeed(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.IMPORT_TYPE]: "seed",
  });
  // Clear any stored private key
  await chrome.storage.local.remove([
    STORAGE_KEYS.IMPORTED_PRIVATE_KEY,
    STORAGE_KEYS.IMPORTED_PK_SALT,
    STORAGE_KEYS.IMPORTED_PK_IV,
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
 * Get the next burner wallet index for a network
 */
export async function getNextBurnerIndex(
  network: NetworkType
): Promise<number> {
  const key = burnerIndexKey(network);
  const result = await chrome.storage.local.get(key);
  const currentIndex = result[key];
  if (typeof currentIndex === "number" && Number.isInteger(currentIndex)) {
    return currentIndex;
  }
  if (network === "solana") {
    const legacy = await chrome.storage.local.get(STORAGE_KEYS.BURNER_INDEX);
    return (legacy[STORAGE_KEYS.BURNER_INDEX] as number) || 0;
  }
  return 0;
}

/**
 * Increment and save the burner wallet index for a network
 */
export async function incrementBurnerIndex(
  network: NetworkType
): Promise<number> {
  const currentIndex = await getNextBurnerIndex(network);
  const nextIndex = currentIndex + 1;
  await chrome.storage.local.set({ [burnerIndexKey(network)]: nextIndex });
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
 * Generate a new burner wallet keypair for the given network
 */
export async function generateBurnerKeypair(
  seed: Uint8Array,
  network: NetworkType
): Promise<
  | { keypair: Keypair; index: number }
  | { address: string; privateKey: string; index: number }
> {
  const retired = await getRetiredBurners(network);
  let index = await getNextBurnerIndex(network);

  while (retired.includes(index)) {
    index = await incrementBurnerIndex(network);
  }

  await incrementBurnerIndex(network);

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
 * Get Solana keypair for a wallet index
 */
export async function getKeypairForIndex(
  password: string,
  index: number
): Promise<Keypair> {
  if (index === 0) {
    const importedKeypair = await getImportedKeypair(password);
    if (importedKeypair) return importedKeypair;
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
  const seed = await getDecryptedSeed(password);
  return deriveEthereumWalletFromSeed(seed, index);
}
