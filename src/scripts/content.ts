/**
 * Content script for Veil extension
 * 
 * Responsibilities:
 * - Injects provider-inject.js into page context (avoids CSP violations)
 * - Bridges communication between injected provider and background script
 * - Does NOT override window.solana - provider handles coexistence logic
 */

console.log('[Veil Content] Content script loading...');

// Check if extension context is valid
if (!chrome?.runtime?.id) {
  console.error('[Veil Content] Extension context is invalid');
}

// Inject provider script from separate file to avoid CSP violations
const script = document.createElement('script');
script.src = chrome.runtime.getURL('provider-inject.js');
script.onload = () => {
  console.log('[Veil Content] Provider script injected');
  // Remove script tag after injection
  if (script.parentNode) {
    script.parentNode.removeChild(script);
  }
};
script.onerror = (error) => {
  console.error('[Veil Content] Failed to inject provider script:', error);
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from injected provider script
window.addEventListener('message', async (event) => {
  // Only accept messages from our injected script
  if (event.source !== window || event.data?.source !== 'veil-dapp') {
    return;
  }

  const { method, params, id } = event.data;
  console.log('[Veil Content] Received request:', { method, id });

  try {
    // Check if chrome.runtime is available
    if (!chrome?.runtime?.sendMessage) {
      console.error('[Veil Content] chrome.runtime.sendMessage not available');
      window.postMessage({
        source: 'veil-provider',
        id,
        error: {
          code: -32000,
          message: 'Extension context invalid. Please refresh the page.',
        },
      }, '*');
      return;
    }

    // Forward to background script
    const response = await chrome.runtime.sendMessage({
      type: 'providerRequest',
      method,
      params,
      id,
    });

    console.log('[Veil Content] Background response:', response);

    // Handle case where response is undefined or malformed
    if (!response) {
      window.postMessage({
        source: 'veil-provider',
        id,
        error: {
          code: -32000,
          message: 'No response from background script',
        },
      }, '*');
      return;
    }

    // Send response back to injected script
    window.postMessage({
      source: 'veil-provider',
      id,
      result: response.success ? response.result : undefined,
      error: response.error || (!response.success ? { code: -32000, message: 'Unknown error' } : undefined),
    }, '*');
  } catch (error) {
    console.error('[Veil Content] Error:', error);
    // Send error back to injected script
    window.postMessage({
      source: 'veil-provider',
      id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    }, '*');
  }
});
