import type { ExtensionMessage, ExtensionResponse } from "../types";

/**
 * Send a message and wait for a response
 * @param message - The message to send
 * @returns Promise that resolves with the response
 */
export async function sendMessage<
  T extends ExtensionResponse = ExtensionResponse
>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

/**
 * Listen for messages
 * @param handler - Function to handle incoming messages
 * @returns Function to remove the listener
 */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => boolean | void
): () => void {
  const listener = (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    return handler(message, sender, sendResponse);
  };

  chrome.runtime.onMessage.addListener(listener);

  // Return cleanup function
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}

/**
 * Helper to create a typed message handler
 * @param type - The message type to listen for
 * @param handler - Function to handle the message
 * @returns Function to remove the listener
 */
export function onMessageType<T extends ExtensionMessage>(
  type: T["type"],
  handler: (
    message: T,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => boolean | void | Promise<ExtensionResponse>
): () => void {
  return onMessage((message, sender, sendResponse) => {
    if (message.type === type) {
      try {
        const result = handler(message as T, sender, sendResponse);

        // Handle async handlers
        if (result instanceof Promise) {
          result
            .then((response) => {
              sendResponse(response);
            })
            .catch((error) => {
              console.error(`Error handling message type ${type}:`, error);
              // Always send a response, even on error, to prevent port closure errors
              sendResponse({
                success: false,
                error: String(error),
              } as ExtensionResponse);
            });
          return true; // Keep channel open for async
        }

        return result;
      } catch (error) {
        console.error(`Sync error handling message type ${type}:`, error);
        sendResponse({
          success: false,
          error: String(error),
        } as ExtensionResponse);
        return false;
      }
    }
    return false;
  });
}
