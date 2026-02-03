/**
 * Error Handling Utilities
 *
 * Provides consistent error handling and user-friendly error messages
 */

export interface AppError {
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  originalError?: Error;
}

/**
 * Error codes
 */
export const ErrorCode = {
  WALLET_NOT_AVAILABLE: "WALLET_NOT_AVAILABLE",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  NETWORK_ERROR: "NETWORK_ERROR",
  RPC_ERROR: "RPC_ERROR",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  SERVICE_NOT_INITIALIZED: "SERVICE_NOT_INITIALIZED",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  USER_REJECTED: "USER_REJECTED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Create a user-friendly error from an unknown error
 */
export function createAppError(error: unknown, context?: string): AppError {
  // If it's already an AppError, return it
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "userMessage" in error
  ) {
    return error as AppError;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  // Parse common error patterns
  if (
    errorMessage.includes("insufficient funds") ||
    errorMessage.includes("Insufficient")
  ) {
    return {
      code: ErrorCode.INSUFFICIENT_BALANCE,
      message: errorMessage,
      userMessage:
        "Insufficient balance. Please check your wallet balance and try again.",
      retryable: false,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (errorMessage.includes("Invalid") && errorMessage.includes("address")) {
    return {
      code: ErrorCode.INVALID_ADDRESS,
      message: errorMessage,
      userMessage:
        "Invalid address. Please check the recipient address and try again.",
      retryable: false,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes("network") ||
    errorMessage.includes("Network") ||
    errorMessage.includes("fetch") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("timeout")
  ) {
    return {
      code: ErrorCode.NETWORK_ERROR,
      message: errorMessage,
      userMessage:
        "Network error. Please check your internet connection and try again.",
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes("RPC") ||
    errorMessage.includes("429") ||
    errorMessage.includes("rate limit")
  ) {
    return {
      code: ErrorCode.RPC_ERROR,
      message: errorMessage,
      userMessage:
        "RPC endpoint error. The system will automatically retry with a different endpoint.",
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes("transaction") &&
    (errorMessage.includes("failed") || errorMessage.includes("rejected"))
  ) {
    return {
      code: ErrorCode.TRANSACTION_FAILED,
      message: errorMessage,
      userMessage:
        "Transaction failed. Please try again or check the transaction details.",
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes("not initialized") ||
    errorMessage.includes("initialize")
  ) {
    return {
      code: ErrorCode.SERVICE_NOT_INITIALIZED,
      message: errorMessage,
      userMessage: "Service not ready. Please wait a moment and try again.",
      retryable: true,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes("user rejected") ||
    errorMessage.includes("User rejected")
  ) {
    return {
      code: ErrorCode.USER_REJECTED,
      message: errorMessage,
      userMessage: "Transaction cancelled by user.",
      retryable: false,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Default unknown error
  return {
    code: ErrorCode.UNKNOWN_ERROR,
    message: errorMessage,
    userMessage: context
      ? `An error occurred while ${context}. Please try again.`
      : "An unexpected error occurred. Please try again.",
    retryable: true,
    originalError: error instanceof Error ? error : undefined,
  };
}

/**
 * Get a short error message for display
 */
export function getErrorMessage(error: unknown, context?: string): string {
  const appError = createAppError(error, context);
  return appError.userMessage;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const appError = createAppError(error);
  return appError.retryable;
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: string): void {
  const appError = createAppError(error, context);
  console.error(`[Veil] ${context || "Error"}:`, {
    code: appError.code,
    message: appError.message,
    userMessage: appError.userMessage,
    retryable: appError.retryable,
    originalError: appError.originalError,
  });
}
