/**
 * Wallet lock/unlock management
 * Handles password-based authentication and session management
 */

const LOCK_STORAGE_KEY = 'veil:is_locked';
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const SESSION_KEY = 'veil:session_expiry';

/**
 * Check if wallet is currently locked
 */
export async function isWalletLocked(): Promise<boolean> {
  if (!chrome?.storage?.local) {
    console.error('[WalletLock] chrome.storage.local is not available');
    return true; // Default to locked if storage not available
  }
  const result = await chrome.storage.local.get(LOCK_STORAGE_KEY);
  return result[LOCK_STORAGE_KEY] !== false;
}

/**
 * Lock the wallet (clear session)
 */
export async function lockWallet(): Promise<void> {
  await chrome.storage.local.set({ [LOCK_STORAGE_KEY]: true });
  await chrome.storage.local.remove(SESSION_KEY);
  // Clear password from storage
  try {
    await chrome.storage.session.remove('veil:session_password');
  } catch {
    // chrome.storage.session might not be available
  }
  await chrome.storage.local.remove('veil:temp_session_password');
}

/**
 * Unlock the wallet (set session)
 */
export async function unlockWallet(): Promise<void> {
  await chrome.storage.local.set({ [LOCK_STORAGE_KEY]: false });
  const expiry = Date.now() + SESSION_TIMEOUT;
  await chrome.storage.local.set({ [SESSION_KEY]: expiry });
}

/**
 * Check if session is still valid
 */
export async function isSessionValid(): Promise<boolean> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  if (!result[SESSION_KEY]) return false;
  
  const expiry = result[SESSION_KEY];
  if (Date.now() > expiry) {
    await lockWallet();
    return false;
  }
  
  return true;
}

/**
 * Extend the current session
 */
export async function extendSession(): Promise<void> {
  if (await isSessionValid()) {
    await unlockWallet(); // This will update the expiry
  }
}
