// Centralized types for the extension

/** Supported chain: Solana (mainnet) or Ethereum (mainnet). Private transfers only on Solana. */
export type NetworkType = "solana" | "ethereum";

// Message types
export type MessageType =
  | "checkBalances"
  | "providerRequest"
  | "connectionApproval"
  | "signApproval";

// Base message interface
export interface BaseMessage {
  type: MessageType;
}

// Specific message interfaces
export interface CheckBalancesMessage extends BaseMessage {
  type: "checkBalances";
}

export interface ProviderRequestMessage extends BaseMessage {
  type: "providerRequest";
  method: string;
  params?: unknown[];
  id: number;
}

export interface ConnectionApprovalMessage extends BaseMessage {
  type: "connectionApproval";
  requestId: string;
  approved: boolean;
  publicKey?: string;
}

export interface SignApprovalMessage extends BaseMessage {
  type: "signApproval";
  requestId: string;
  approved: boolean;
}

// Union type for all messages
export type ExtensionMessage =
  | CheckBalancesMessage
  | ProviderRequestMessage
  | ConnectionApprovalMessage
  | SignApprovalMessage;

// Response types
export interface BalanceUpdate {
  walletIndex: number;
  newBalance: number;
  previousBalance: number;
}

export interface CheckBalancesResponse {
  success: boolean;
  updates?: BalanceUpdate[];
  error?: string;
}

export interface ProviderResponse {
  success: boolean;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Union type for all responses
export type ExtensionResponse = CheckBalancesResponse | ProviderResponse;

// Message handler type
// Note: chrome namespace is available globally when @types/chrome is installed
export type MessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtensionResponse) => void
) => boolean | void;
