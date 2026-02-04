/**
 * Storage adapter for Privacy Cash SDK
 * 
 * The SDK uses node-localstorage which doesn't work in browser extensions.
 * This adapter wraps chrome.storage.local with a synchronous-like API that
 * the SDK expects, using a namespace prefix to isolate Privacy Cash data.
 */

const STORAGE_PREFIX = 'privacycash:';

// In-memory cache for synchronous-like access
const cache: Map<string, string | null> = new Map();

/**
 * Initialize cache from chrome.storage on startup
 */
export async function initializeStorageCache(): Promise<void> {
  try {
    const allData = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        const sdkKey = key.slice(STORAGE_PREFIX.length);
        cache.set(sdkKey, value as string);
      }
    }
  } catch (error) {
    console.error('[PrivacyCash] Error initializing storage cache:', error);
  }
}

/**
 * Storage adapter that implements the Storage interface expected by the SDK
 */
class PrivacyCashStorage implements Storage {
  private prefix: string;

  constructor() {
    this.prefix = STORAGE_PREFIX;
  }

  get length(): number {
    return cache.size;
  }

  key(index: number): string | null {
    const keys = Array.from(cache.keys());
    return keys[index] || null;
  }

  getItem(key: string): string | null {
    // Check cache first for synchronous-like behavior
    if (cache.has(key)) {
      return cache.get(key) ?? null;
    }

    // If not in cache, return null (async operations will populate cache)
    // This is a limitation - we can't make chrome.storage truly synchronous
    // but the SDK should work with this as long as we populate cache before SDK operations
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const storageKey = `${this.prefix}${key}`;
    
    // Update cache immediately
    cache.set(key, value);
    
    // Persist to chrome.storage
    try {
      await chrome.storage.local.set({ [storageKey]: value });
    } catch (error) {
      console.error(`[PrivacyCash] Error setting item ${key}:`, error);
      // Remove from cache on error
      cache.delete(key);
      throw error;
    }
  }

  async removeItem(key: string): Promise<void> {
    const storageKey = `${this.prefix}${key}`;
    
    // Remove from cache
    cache.delete(key);
    
    // Remove from chrome.storage
    try {
      await chrome.storage.local.remove(storageKey);
    } catch (error) {
      console.error(`[PrivacyCash] Error removing item ${key}:`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    // Get all Privacy Cash keys
    const allData = await chrome.storage.local.get(null);
    const keysToRemove: string[] = [];
    
    for (const key of Object.keys(allData)) {
      if (key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    
    // Clear cache
    cache.clear();
    
    // Remove from chrome.storage
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }
}

// Create singleton instance
let storageInstance: PrivacyCashStorage | null = null;

/**
 * Get the storage adapter instance
 * This implements the Storage interface expected by the SDK
 */
export function getPrivacyCashStorage(): Storage {
  if (!storageInstance) {
    storageInstance = new PrivacyCashStorage();
  }
  return storageInstance;
}

/**
 * Pre-populate cache for a specific public key
 * Call this before SDK operations to ensure synchronous getItem() works
 */
export async function preloadStorageForPublicKey(publicKey: string): Promise<void> {
  const allData = await chrome.storage.local.get(null);
  
  // SDK uses keys like: fetch_offset{publicKey}, encrypted_outputs{publicKey}, etc.
  const patterns = [
    `fetch_offset${publicKey}`,
    `encrypted_outputs${publicKey}`,
  ];
  
  // Also check for history keys (they may have different patterns)
  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const sdkKey = key.slice(STORAGE_PREFIX.length);
      // If key contains the public key, cache it
      if (sdkKey.includes(publicKey)) {
        cache.set(sdkKey, value as string);
      }
    }
  }
  
  // Explicitly load known patterns
  for (const pattern of patterns) {
    const storageKey = `${STORAGE_PREFIX}${pattern}`;
    const result = await chrome.storage.local.get(storageKey);
    if (result[storageKey]) {
      cache.set(pattern, result[storageKey] as string);
    }
  }
}
