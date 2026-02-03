/**
 * Settings management utilities
 * Handles user preferences and configuration
 */

const SETTINGS_KEYS = {
  PRIVACY_CASH_MODE: "veil:privacy_cash_mode",
} as const;

/**
 * Get Privacy Cash mode setting.
 * Optional feature for unlinkable on-chain transfers; burner wallets are the core security.
 */
export async function getPrivacyCashMode(): Promise<boolean> {
  const result = await chrome.storage.local.get(
    SETTINGS_KEYS.PRIVACY_CASH_MODE
  );
  const stored = result[SETTINGS_KEYS.PRIVACY_CASH_MODE];

  // Default: true (Privacy Cash mode enabled) when no preference is stored
  if (stored === undefined) {
    return true;
  }

  // Otherwise, respect the stored boolean
  return stored === true;
}

/**
 * Set Privacy Cash mode setting
 */
export async function setPrivacyCashMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEYS.PRIVACY_CASH_MODE]: enabled,
  });
}
