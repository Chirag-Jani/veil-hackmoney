/**
 * Veil Wallet Provider Injection
 * 
 * Implements a coexisting Solana wallet provider that:
 * - Does NOT override window.solana
 * - Registers under window.solana.providers (if window.solana exists)
 * - Exposes window.veil as wallet-specific namespace
 * - Works alongside Phantom, Solflare, and other wallets
 */

(function() {
  'use strict';
  
  // Prevent double injection
  if (window.veil && window.veil._isVeilProvider) {
    return;
  }
  
  let requestId = 0;
  const pendingRequests = new Map();
  
  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'veil-provider') {
      return;
    }
    
    const response = event.data;
    console.log('[Veil Provider] Received response:', response);
    
    if (!response || typeof response.id === 'undefined') {
      console.error('[Veil Provider] Invalid response format:', response);
      return;
    }
    
    const pending = pendingRequests.get(response.id);
    if (pending) {
      pendingRequests.delete(response.id);
      if (response.error) {
        console.error('[Veil Provider] Request error:', response.error);
        pending.reject(new Error(response.error.message || 'Unknown error'));
      } else {
        console.log('[Veil Provider] Request success:', response.result);
        pending.resolve(response.result);
      }
    } else {
      console.warn('[Veil Provider] No pending request for id:', response.id);
    }
  });
  
  /**
   * Send request to content script, which forwards to background
   */
  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      try {
        const id = ++requestId;
        console.log('[Veil Provider] Sending request:', { method, id });
        
        if (!pendingRequests || typeof pendingRequests.set !== 'function') {
          console.error('[Veil Provider] pendingRequests is invalid:', pendingRequests);
          reject(new Error('Internal provider error'));
          return;
        }
        
        pendingRequests.set(id, { resolve, reject });
        
        // Send to content script via postMessage
        window.postMessage({
          source: 'veil-dapp',
          method,
          params,
          id,
        }, '*');
        
        // Timeout after 60 seconds (increased for approval flow)
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            console.warn('[Veil Provider] Request timeout:', { method, id });
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 60000);
      } catch (error) {
        console.error('[Veil Provider] Error in sendRequest:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Simple PublicKey implementation for compatibility
   * Uses actual Solana PublicKey if available, otherwise provides minimal interface
   */
  class SimplePublicKey {
    constructor(key) {
      this._key = key;
    }
    
    toBase58() {
      return this._key;
    }
    
    toString() {
      return this._key;
    }
    
    equals(other) {
      if (!other) return false;
      const otherKey = typeof other.toBase58 === 'function' ? other.toBase58() : String(other);
      return this._key === otherKey;
    }
  }
  
  /**
   * Create the Veil provider object
   * Follows Solana wallet adapter conventions
   */
  function createVeilProvider() {
    const provider = {
      // Provider identification
      name: 'Veil',
      _isVeilProvider: true,
      
      // Connection state
      publicKey: null,
      isConnected: false,
      
      // Event handlers
      _eventHandlers: new Map(),
      
      /**
       * Connect to Veil wallet
       * Requires user approval - no auto-connect
       */
      connect: async (options) => {
        try {
          const result = await sendRequest('connect', [options]);
          
          // Validate result
          if (!result || typeof result !== 'object') {
            throw new Error('Invalid response from wallet');
          }
          
          if (!result.publicKey) {
            throw new Error('No public key returned from wallet');
          }
          
          const publicKey = new SimplePublicKey(result.publicKey);
          
          provider.publicKey = publicKey;
          provider.isConnected = true;
          
          // Emit connect event
          emit(provider, 'connect', publicKey);
          
          return { publicKey };
        } catch (error) {
          provider.publicKey = null;
          provider.isConnected = false;
          throw error;
        }
      },
      
      /**
       * Disconnect from Veil wallet
       */
      disconnect: async () => {
        try {
          await sendRequest('disconnect');
          provider.publicKey = null;
          provider.isConnected = false;
          emit(provider, 'disconnect');
        } catch (error) {
          // Still clear state even if disconnect request fails
          provider.publicKey = null;
          provider.isConnected = false;
          throw error;
        }
      },
      
      /**
       * Sign a transaction
       * Accepts VersionedTransaction or serialized Uint8Array
       */
      signTransaction: async (transaction) => {
        if (!provider.isConnected) {
          throw new Error('Wallet not connected');
        }
        
        let serialized;
        if (transaction instanceof Uint8Array) {
          serialized = Array.from(transaction);
        } else if (transaction && typeof transaction.serialize === 'function') {
          serialized = Array.from(transaction.serialize());
        } else {
          throw new Error('Invalid transaction format. Expected VersionedTransaction or Uint8Array.');
        }
        
        const result = await sendRequest('signTransaction', [serialized]);
        return new Uint8Array(result.transaction);
      },
      
      /**
       * Sign multiple transactions
       */
      signAllTransactions: async (transactions) => {
        if (!provider.isConnected) {
          throw new Error('Wallet not connected');
        }
        
        if (!Array.isArray(transactions)) {
          throw new Error('Expected array of transactions');
        }
        
        const serialized = transactions.map(tx => {
          if (tx instanceof Uint8Array) {
            return Array.from(tx);
          } else if (tx && typeof tx.serialize === 'function') {
            return Array.from(tx.serialize());
          }
          throw new Error('Invalid transaction format in array');
        });
        
        const result = await sendRequest('signAllTransactions', [serialized]);
        return result.transactions.map(tx => new Uint8Array(tx));
      },
      
      /**
       * Sign a message
       * Message must be Uint8Array
       */
      signMessage: async (message, display) => {
        if (!provider.isConnected) {
          throw new Error('Wallet not connected');
        }
        
        if (!(message instanceof Uint8Array)) {
          throw new Error('Message must be Uint8Array');
        }
        
        const result = await sendRequest('signMessage', [Array.from(message), display]);
        return {
          signature: new Uint8Array(result.signature),
          publicKey: new SimplePublicKey(result.publicKey),
        };
      },
      
      /**
       * Event emitter methods
       */
      on: function(event, handler) {
        if (typeof handler !== 'function') {
          throw new Error('Handler must be a function');
        }
        if (!this._eventHandlers.has(event)) {
          this._eventHandlers.set(event, new Set());
        }
        this._eventHandlers.get(event).add(handler);
      },
      
      removeListener: function(event, handler) {
        this._eventHandlers.get(event)?.delete(handler);
      },
      
      removeAllListeners: function(event) {
        if (event) {
          this._eventHandlers.delete(event);
        } else {
          this._eventHandlers.clear();
        }
      },
      
      // Wallet adapter compatibility flags
      isPhantom: false,
      isSolflare: false,
      isBackpack: false,
    };
    
    return provider;
  }
  
  /**
   * Emit event to all registered handlers
   */
  function emit(provider, event, ...args) {
    const handlers = provider._eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error('[Veil] Error in event handler:', error);
        }
      });
    }
  }
  
  // Create the Veil provider
  const veilProvider = createVeilProvider();
  
  // Expose window.veil as the main namespace
  window.veil = veilProvider;

  /**
   * EIP-1193 Ethereum provider (minimal) for dapps that require window.ethereum.
   * This does NOT override an existing injected provider (e.g. MetaMask).
   */
  function createVeilEthereumProvider() {
    const eth = {
      _isVeilEthereum: true,
      isVeil: true,
      isMetaMask: false,

      // Basic event handlers (EIP-1193)
      _eventHandlers: new Map(),

      request: async ({ method, params } = {}) => {
        if (!method || typeof method !== 'string') {
          throw new Error('Invalid request method');
        }
        // Pass through to background via content-script bridge.
        return sendRequest(method, params);
      },

      // Legacy alias used by some libraries
      enable: async () => {
        const accounts = await eth.request({ method: 'eth_requestAccounts' });
        return accounts;
      },

      // EventEmitter-like API expected by many dapps
      on: function (event, handler) {
        if (typeof handler !== 'function') throw new Error('Handler must be a function');
        if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, new Set());
        this._eventHandlers.get(event).add(handler);
      },

      removeListener: function (event, handler) {
        this._eventHandlers.get(event)?.delete(handler);
      },

      // Some libs call off()
      off: function (event, handler) {
        this.removeListener(event, handler);
      },

      // Minimal helpers
      isConnected: () => true,
    };

    eth._emit = function (event, ...args) {
      const handlers = eth._eventHandlers.get(event);
      if (!handlers) return;
      handlers.forEach((h) => {
        try {
          h(...args);
        } catch (e) {
          console.error('[Veil Ethereum] Error in event handler:', e);
        }
      });
    };

    return eth;
  }

  // Expose window.ethereum if not already present
  if (!window.ethereum) {
    const veilEthereum = createVeilEthereumProvider();
    window.ethereum = veilEthereum;
    window.veilEthereum = veilEthereum;

    // Signal for consumers waiting on injection (used by some detection logic)
    try {
      window.dispatchEvent(new Event('ethereum#initialized'));
    } catch {
      // ignore
    }
  } else {
    // If an Ethereum provider already exists, keep it and optionally register ourselves
    // under window.ethereum.providers for multi-provider consumers.
    try {
      const existing = window.ethereum;
      const veilEthereum = createVeilEthereumProvider();
      window.veilEthereum = veilEthereum;
      if (Array.isArray(existing.providers)) {
        const hasVeil = existing.providers.some((p) => p && p._isVeilEthereum);
        if (!hasVeil) existing.providers.push(veilEthereum);
      }
    } catch {
      // ignore
    }
  }
  
  /**
   * Register with window.solana.providers if window.solana exists
   * This allows coexistence with Phantom, Solflare, etc.
   */
  if (window.solana) {
    // window.solana already exists (e.g., Phantom is installed)
    
    // If window.solana.providers exists, add Veil to it
    if (Array.isArray(window.solana.providers)) {
      // Check if Veil is already registered
      const existingIndex = window.solana.providers.findIndex(
        p => p && p.name === 'Veil'
      );
      
      if (existingIndex >= 0) {
        // Replace existing Veil provider
        window.solana.providers[existingIndex] = veilProvider;
      } else {
        // Add Veil provider
        window.solana.providers.push(veilProvider);
      }
    } else {
      // window.solana exists but providers array doesn't
      // Create providers array and add both existing provider and Veil
      const existingProvider = window.solana;
      window.solana.providers = [existingProvider, veilProvider];
    }
  } else {
    // window.solana doesn't exist yet
    // Create it with Veil as the default provider
    // Also create providers array for future wallet coexistence
    window.solana = veilProvider;
    window.solana.providers = [veilProvider];
  }
  
  /**
   * Check for existing connection state (no auto-connect)
   * Only check, don't automatically connect
   */
  sendRequest('getAccount')
    .then(result => {
      if (result && result.publicKey) {
        // Account exists but don't auto-connect
        // User must explicitly call connect()
        veilProvider.publicKey = new SimplePublicKey(result.publicKey);
        // Don't set isConnected to true - requires explicit connect()
      }
    })
    .catch(() => {
      // No existing account or error - that's fine
      // User will need to connect explicitly
    });
  
  // Helper function for emit (bound to provider)
  veilProvider._emit = function(event, ...args) {
    emit(this, event, ...args);
  };
})();
