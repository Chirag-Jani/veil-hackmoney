import "../polyfills";
import { Wallet } from "ethers";
import { getBalanceMonitor } from "../utils/balanceMonitor";
import { getEthereumWalletForIndex } from "../utils/keyManager";
import { onMessageType } from "../utils/messaging";
import {
  checkWalletUnlocked,
  getActiveBurnerWallet,
  signMessageWithActiveWallet,
} from "../utils/solanaProvider";
import {
  isSiteConnected,
  storeConnectedSite,
  storePendingConnection,
  getConnectionApproval,
  removeConnectionApproval,
  removePendingConnection,
  removeConnectedSite,
  storeConnectionApproval,
  storePendingSignRequest,
  getSignApproval,
  removeSignApproval,
  removePendingSignRequest,
  storeSignApproval,
  getActiveBurnerWallet as getActiveBurnerWalletForNetwork,
  type ConnectedSite,
  type PendingConnectionRequest,
  type PendingSignRequest,
} from "../utils/storage";

// Background service worker
console.log("[Background] Service worker starting...");
console.log("[Background] chrome.storage available:", !!chrome?.storage?.local);

// Initialize balance monitor
const balanceMonitor = getBalanceMonitor();

// Listen for extension installation
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await balanceMonitor.initialize();
    balanceMonitor.startMonitoring();
  } catch (error) {
    console.error("[Background] Error initializing balance monitor:", error);
  }
});

// Start balance monitoring when service worker wakes up
(async () => {
  try {
    await balanceMonitor.initialize();
    balanceMonitor.startMonitoring();
  } catch (error) {
    console.error("[Background] Error starting balance monitor:", error);
  }
})();

// Listen for balance check requests
onMessageType("checkBalances", async () => {
  try {
    const updates = await balanceMonitor.checkBalances();
    return { success: true, updates } as import("../types").CheckBalancesResponse;
  } catch (error) {
    console.error("[Background] Error checking balances:", error);
    return { success: false, error: String(error) } as import("../types").CheckBalancesResponse;
  }
});

// Simple health check - use raw listener for this
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    console.log('[Background] Received ping');
    sendResponse({ success: true, pong: true, storageAvailable: !!chrome?.storage?.local });
    return true;
  }
  return false;
});

/**
 * Get session password from storage
 * Uses chrome.storage.local with a specific key since chrome.storage.session
 * may not be available in all contexts
 */
async function getSessionPassword(): Promise<string | null> {
  try {
    // Try chrome.storage.session first (MV3)
    if (chrome.storage.session) {
      const sessionData = await chrome.storage.session.get("veil:session_password");
      if (sessionData["veil:session_password"]) {
        return sessionData["veil:session_password"] as string;
      }
    }
  } catch {
    // chrome.storage.session not available, fall through
  }
  
  // Fallback to local storage
  try {
    const localData = await chrome.storage.local.get("veil:temp_session_password");
    return localData["veil:temp_session_password"] as string || null;
  } catch {
    return null;
  }
}

/**
 * Open extension popup
 */
async function openExtensionPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.error('[Background] Error opening popup:', error);
    throw error;
  }
}

/**
 * Wait for wallet to be unlocked
 */
async function waitForUnlock(timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;
  
  while (Date.now() - startTime < timeoutMs) {
    const isUnlocked = await checkWalletUnlocked();
    if (isUnlocked) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  return false;
}

/**
 * Wait for connection approval from user
 */
async function waitForConnectionApproval(requestId: string, timeoutMs: number = 60000): Promise<{ approved: boolean; publicKey?: string }> {
  const startTime = Date.now();
  const pollInterval = 500;
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await getConnectionApproval(requestId);
    if (result) {
      // Clean up
      await removeConnectionApproval(requestId);
      await removePendingConnection(requestId);
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // Timeout - clean up pending request
  await removePendingConnection(requestId);
  return { approved: false };
}

/**
 * Wait for sign approval from user
 */
async function waitForSignApproval(requestId: string, timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await getSignApproval(requestId);
    if (result) {
      // Clean up
      await removeSignApproval(requestId);
      await removePendingSignRequest(requestId);
      return result.approved;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // Timeout - clean up pending request
  await removePendingSignRequest(requestId);
  return false;
}

/**
 * Extract origin from sender
 */
function getOriginFromSender(sender: chrome.runtime.MessageSender): string {
  if (sender.origin) {
    return sender.origin;
  }
  if (sender.url) {
    try {
      const url = new URL(sender.url);
      return url.origin;
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

// Listen for provider requests
onMessageType("providerRequest", async (message, sender) => {
  const { method, params } = message as import("../types").ProviderRequestMessage;
  const origin = getOriginFromSender(sender);

  console.log(`[Background] providerRequest: ${method} from ${origin}`);

  try {
    // Verify chrome.storage.local is available
    if (!chrome?.storage?.local) {
      console.error("[Background] chrome.storage.local is not available");
      return {
        success: false,
        error: { code: -32000, message: "Storage not available" },
      } as import("../types").ProviderResponse;
    }

    // Check if wallet is unlocked
    let isUnlocked = await checkWalletUnlocked();

    const isEthereumMethod =
      method === "net_version" ||
      (typeof method === "string" &&
        (method.startsWith("eth_") || method.startsWith("wallet_")));

    const getEthAddressForConnectedSite = async (): Promise<string | null> => {
      const siteConnected = await isSiteConnected(origin);
      if (!siteConnected) return null;
      const active = await getActiveBurnerWalletForNetwork("ethereum");
      return active?.fullAddress ?? active?.address ?? null;
    };

    // Ethereum provider (EIP-1193) methods
    if (isEthereumMethod) {
      // Public methods that should not require a connection
      if (method === "eth_chainId") {
        return { success: true, result: "0x1" } as import("../types").ProviderResponse;
      }
      if (method === "net_version") {
        return { success: true, result: "1" } as import("../types").ProviderResponse;
      }

      // Methods that expose accounts
      if (method === "eth_accounts") {
        const addr = await getEthAddressForConnectedSite();
        return {
          success: true,
          result: addr ? [addr] : [],
        } as import("../types").ProviderResponse;
      }

      if (method === "eth_coinbase") {
        const addr = await getEthAddressForConnectedSite();
        return {
          success: true,
          result: addr,
        } as import("../types").ProviderResponse;
      }

      // Connection / permissioning (requires unlock and user approval)
      if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") {
        // If locked, open popup and wait for unlock
        if (!isUnlocked) {
          try {
            await openExtensionPopup();
            isUnlocked = await waitForUnlock(60000);

            if (!isUnlocked) {
              return {
                success: false,
                error: { code: -32002, message: "Wallet unlock timeout." },
              } as import("../types").ProviderResponse;
            }
          } catch (error) {
            return {
              success: false,
              error: {
                code: -32002,
                message: `Failed to open wallet: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            } as import("../types").ProviderResponse;
          }
        }

        // If site already connected, return accounts/permissions
        const alreadyConnected = await isSiteConnected(origin);
        if (alreadyConnected) {
          const activeWallet = await getActiveBurnerWalletForNetwork("ethereum");
          const address = activeWallet?.fullAddress ?? activeWallet?.address;
          if (!address) {
            return {
              success: false,
              error: { code: -32000, message: "No active Ethereum wallet found." },
            } as import("../types").ProviderResponse;
          }
          if (method === "wallet_requestPermissions") {
            return {
              success: true,
              result: [{ parentCapability: "eth_accounts" }],
            } as import("../types").ProviderResponse;
          }
          return {
            success: true,
            result: [address],
          } as import("../types").ProviderResponse;
        }

        // Create pending connection request
        const requestId = `${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const pendingRequest: PendingConnectionRequest = {
          id: requestId,
          origin,
          requestedAt: Date.now(),
        };

        await storePendingConnection(pendingRequest);

        // Open popup to show connection approval
        try {
          await openExtensionPopup();
        } catch {
          // Popup might already be open
        }

        // Wait for user approval
        console.log("[Background] Waiting for connection approval...");
        const approval = await waitForConnectionApproval(requestId, 60000);
        console.log("[Background] Approval result:", approval);

        if (!approval.approved) {
          return {
            success: false,
            error: { code: 4001, message: "User rejected the request." },
          } as import("../types").ProviderResponse;
        }

        // Store connected site
        const activeWallet = await getActiveBurnerWalletForNetwork("ethereum");
        const address = activeWallet?.fullAddress ?? activeWallet?.address;
        if (!address || !activeWallet) {
          return {
            success: false,
            error: { code: -32000, message: "No active Ethereum wallet found." },
          } as import("../types").ProviderResponse;
        }

        const connectedSite: ConnectedSite = {
          id: Date.now(),
          domain: origin,
          favicon: "",
          connected: true,
          burnerIndex: activeWallet.index,
          connectedAt: Date.now(),
        };

        await storeConnectedSite(connectedSite);

        if (method === "wallet_requestPermissions") {
          return {
            success: true,
            result: [{ parentCapability: "eth_accounts" }],
          } as import("../types").ProviderResponse;
        }

        return {
          success: true,
          result: [address],
        } as import("../types").ProviderResponse;
      }

      if (method === "wallet_getPermissions") {
        const addr = await getEthAddressForConnectedSite();
        return {
          success: true,
          result: addr ? [{ parentCapability: "eth_accounts" }] : [],
        } as import("../types").ProviderResponse;
      }

      // Transaction signing — same as SOL: coming soon
      if (method === "eth_sendTransaction" || method === "eth_signTransaction") {
        return {
          success: false,
          error: {
            code: -32601,
            message:
              "Transaction signing is not yet available. This feature will be added in a future update.",
          },
        } as import("../types").ProviderResponse;
      }

      // Typed data signing — coming soon
      if (
        method === "eth_signTypedData" ||
        method === "eth_signTypedData_v3" ||
        method === "eth_signTypedData_v4"
      ) {
        return {
          success: false,
          error: {
            code: -32601,
            message:
              "Typed data signing is not yet available. This feature will be added in a future update.",
          },
        } as import("../types").ProviderResponse;
      }

      // Deprecated raw hash signing — direct to personal_sign
      if (method === "eth_sign") {
        return {
          success: false,
          error: {
            code: -32601,
            message:
              "eth_sign is deprecated and not supported. Use personal_sign instead.",
          },
        } as import("../types").ProviderResponse;
      }

      // personal_sign — message signing (same as SOL signMessage)
      if (method === "personal_sign") {
        if (!isUnlocked) {
          try {
            await openExtensionPopup();
            isUnlocked = await waitForUnlock(60000);
            if (!isUnlocked) {
              return {
                success: false,
                error: { code: -32002, message: "Wallet unlock timeout." },
              } as import("../types").ProviderResponse;
            }
          } catch (error) {
            return {
              success: false,
              error: {
                code: -32002,
                message: `Failed to open wallet: ${error instanceof Error ? error.message : String(error)}`,
              },
            } as import("../types").ProviderResponse;
          }
        }
        const siteConnected = await isSiteConnected(origin);
        if (!siteConnected) {
          return {
            success: false,
            error: { code: 4100, message: "The requested method requires an active connection." },
          } as import("../types").ProviderResponse;
        }
        const password = await getSessionPassword();
        if (!password) {
          return {
            success: false,
            error: { code: -32002, message: "Session expired. Please unlock your wallet again." },
          } as import("../types").ProviderResponse;
        }
        const messageHex = typeof params?.[0] === "string" ? (params[0] as string) : "";
        if (!messageHex) {
          return {
            success: false,
            error: { code: -32602, message: "personal_sign requires message (hex string)." },
          } as import("../types").ProviderResponse;
        }
        const hexStr = messageHex.startsWith("0x") ? messageHex.slice(2) : messageHex;
        const messageBytes: number[] = [];
        for (let i = 0; i < hexStr.length; i += 2) {
          messageBytes.push(parseInt(hexStr.slice(i, i + 2), 16));
        }
        const requestId = `sign-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const pendingRequest: PendingSignRequest = {
          id: requestId,
          origin,
          type: "message",
          data: { message: messageBytes, display: messageHex.slice(0, 20) + (messageHex.length > 20 ? "…" : "") },
          requestedAt: Date.now(),
        };
        await storePendingSignRequest(pendingRequest);
        try {
          await openExtensionPopup();
        } catch {
          // popup may already be open
        }
        const approved = await waitForSignApproval(requestId, 60000);
        if (!approved) {
          return {
            success: false,
            error: { code: 4001, message: "User rejected the request." },
          } as import("../types").ProviderResponse;
        }
        try {
          const activeWallet = await getActiveBurnerWalletForNetwork("ethereum");
          if (!activeWallet) {
            return {
              success: false,
              error: { code: -32000, message: "No active Ethereum wallet found." },
            } as import("../types").ProviderResponse;
          }
          const { privateKey } = await getEthereumWalletForIndex(password, activeWallet.index);
          const wallet = new Wallet(privateKey);
          const signature = await wallet.signMessage(messageHex.startsWith("0x") ? messageHex : "0x" + messageHex);
          return {
            success: true,
            result: signature,
          } as import("../types").ProviderResponse;
        } catch (err) {
          console.error("[Background] personal_sign error:", err);
          return {
            success: false,
            error: {
              code: -32000,
              message: err instanceof Error ? err.message : String(err),
            },
          } as import("../types").ProviderResponse;
        }
      }

      // Not implemented yet
      return {
        success: false,
        error: { code: -32601, message: `Method not found: ${method}` },
      } as import("../types").ProviderResponse;
    }
    
    // Handle connect request
    if (method === 'connect') {
      // If locked, open popup and wait for unlock
      if (!isUnlocked) {
        try {
          await openExtensionPopup();
          isUnlocked = await waitForUnlock(60000);
          
          if (!isUnlocked) {
            return {
              success: false,
              error: { code: -32002, message: "Wallet unlock timeout." },
            } as import("../types").ProviderResponse;
          }
        } catch (error) {
          return {
            success: false,
            error: { code: -32002, message: `Failed to open wallet: ${error instanceof Error ? error.message : String(error)}` },
          } as import("../types").ProviderResponse;
        }
      }

      // Check if site is already connected
      const alreadyConnected = await isSiteConnected(origin);
      if (alreadyConnected) {
        // Return existing connection
        const activeWallet = await getActiveBurnerWallet();
        return {
          success: true,
          result: { publicKey: activeWallet.fullAddress },
        } as import("../types").ProviderResponse;
      }

      // Create pending connection request
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const pendingRequest: PendingConnectionRequest = {
        id: requestId,
        origin,
        requestedAt: Date.now(),
      };
      
      await storePendingConnection(pendingRequest);
      
      // Open popup to show connection approval
      try {
        await openExtensionPopup();
      } catch {
        // Popup might already be open
      }
      
      // Wait for user approval
      console.log("[Background] Waiting for connection approval...");
      const approval = await waitForConnectionApproval(requestId, 60000);
      console.log("[Background] Approval result:", approval);
      
      if (!approval.approved) {
        return {
          success: false,
          error: { code: 4001, message: "User rejected the request." },
        } as import("../types").ProviderResponse;
      }

      // Store connected site
      try {
        console.log("[Background] Getting active wallet...");
        const activeWallet = await getActiveBurnerWallet();
        console.log("[Background] Active wallet:", activeWallet?.fullAddress);
        
        const connectedSite: ConnectedSite = {
          id: Date.now(),
          domain: origin,
          favicon: '',
          connected: true,
          burnerIndex: activeWallet.index,
          connectedAt: Date.now(),
        };
        
        console.log("[Background] Storing connected site...");
        await storeConnectedSite(connectedSite);
        console.log("[Background] Connected site stored successfully");

        return {
          success: true,
          result: { publicKey: activeWallet.fullAddress },
        } as import("../types").ProviderResponse;
      } catch (walletError) {
        console.error("[Background] Error after approval:", walletError);
        return {
          success: false,
          error: { code: -32000, message: `Failed to complete connection: ${walletError instanceof Error ? walletError.message : String(walletError)}` },
        } as import("../types").ProviderResponse;
      }
    }

    // For other methods, require unlock and site connection
    if (!isUnlocked) {
      return {
        success: false,
        error: { code: -32002, message: "Wallet is locked. Please unlock your wallet first." },
      } as import("../types").ProviderResponse;
    }

    // Check if site is connected (except for getAccount and disconnect)
    if (method !== 'getAccount' && method !== 'disconnect') {
      const siteConnected = await isSiteConnected(origin);
      if (!siteConnected) {
        return {
          success: false,
          error: { code: 4100, message: "The requested method requires an active connection." },
        } as import("../types").ProviderResponse;
      }
    }

    // Get password
    const password = await getSessionPassword();
    if (!password && method !== 'getAccount' && method !== 'disconnect') {
      return {
        success: false,
        error: { code: -32002, message: "Session expired. Please unlock your wallet again." },
      } as import("../types").ProviderResponse;
    }

    let result: unknown;

    switch (method) {
      case "disconnect": {
        // Remove site from connected sites
        await removeConnectedSite(origin);
        result = { success: true };
        break;
      }

      case "getAccount": {
        try {
          const siteConnected = await isSiteConnected(origin);
          if (siteConnected) {
            const activeWallet = await getActiveBurnerWallet();
            result = { publicKey: activeWallet.fullAddress };
          } else {
            result = null;
          }
        } catch {
          result = null;
        }
        break;
      }

      case "signTransaction": {
        // Transaction signing coming soon
        return {
          success: false,
          error: { 
            code: -32601, 
            message: "Transaction signing is not yet available. This feature will be added in a future update." 
          },
        } as import("../types").ProviderResponse;
      }

      case "signAllTransactions": {
        // Transaction signing coming soon
        return {
          success: false,
          error: { 
            code: -32601, 
            message: "Transaction signing is not yet available. This feature will be added in a future update." 
          },
        } as import("../types").ProviderResponse;
      }

      case "signMessage": {
        if (!password) throw new Error("Session expired");
        const [messageBytes, display] = params as [number[], string?];
        
        // Create pending sign request
        const requestId = `sign-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const pendingRequest: PendingSignRequest = {
          id: requestId,
          origin,
          type: 'message',
          data: {
            message: messageBytes,
            display,
          },
          requestedAt: Date.now(),
        };
        
        await storePendingSignRequest(pendingRequest);
        
        // Open popup to show sign approval
        try {
          await openExtensionPopup();
        } catch {
          // Popup might already be open
        }
        
        // Wait for user approval
        const approved = await waitForSignApproval(requestId, 60000);
        
        if (!approved) {
          return {
            success: false,
            error: { code: 4001, message: "User rejected the request." },
          } as import("../types").ProviderResponse;
        }

        // Proceed with signing
        const message = new Uint8Array(messageBytes);
        const signature = await signMessageWithActiveWallet(message, password);
        const activeWallet = await getActiveBurnerWallet();

        result = {
          signature: Array.from(signature),
          publicKey: activeWallet.fullAddress,
        };
        break;
      }

      default:
        return {
          success: false,
          error: { code: -32601, message: `Method not found: ${method}` },
        } as import("../types").ProviderResponse;
    }

    return { success: true, result } as import("../types").ProviderResponse;
  } catch (error) {
    console.error("[Background] Provider request error:", error);
    return {
      success: false,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    } as import("../types").ProviderResponse;
  }
});

// Listen for connection approval from popup
onMessageType("connectionApproval", async (message) => {
  const { requestId, approved, publicKey } = message as {
    type: 'connectionApproval';
    requestId: string;
    approved: boolean;
    publicKey?: string;
  };
  
  await storeConnectionApproval(requestId, approved, publicKey);
  
  return { success: true } as import("../types").ProviderResponse;
});

// Listen for sign approval from popup
onMessageType("signApproval", async (message) => {
  const { requestId, approved } = message as {
    type: 'signApproval';
    requestId: string;
    approved: boolean;
  };
  
  await storeSignApproval(requestId, approved);
  
  return { success: true } as import("../types").ProviderResponse;
});
