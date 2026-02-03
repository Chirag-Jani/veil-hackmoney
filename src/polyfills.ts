/**
 * Browser polyfills for Node.js globals
 */
import { Buffer } from "buffer";
import * as cryptoBrowserify from "crypto-browserify";
import process from "process";

// Create CommonJS module polyfills FIRST (before any modules try to use them)
// This prevents "exports is not defined" errors
const exportsPolyfill: Record<string, unknown> = {};
const modulePolyfill = {
  exports: exportsPolyfill,
  id: "",
  filename: "",
  loaded: true,
  parent: null,
  children: [],
  paths: [],
};

// Set CommonJS globals immediately
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).exports = exportsPolyfill;
  (window as unknown as Record<string, unknown>).module = modulePolyfill;
}
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as Record<string, unknown>).exports = exportsPolyfill;
  (globalThis as unknown as Record<string, unknown>).module = modulePolyfill;
}

// Create a global process object with common properties
const processPolyfill = {
  ...process,
  env: process.env || {},
  browser: true,
  version: "",
  versions: {},
};

// Make globals available on all possible global objects
const setGlobal = (
  obj: typeof globalThis | typeof window,
  name: string,
  value: unknown
) => {
  try {
    (obj as Record<string, unknown>)[name] = value;
  } catch {
    // Ignore errors
  }
};

// Set process
if (typeof window !== "undefined") {
  setGlobal(window, "process", processPolyfill);
  setGlobal(window, "Buffer", Buffer);
  setGlobal(window, "crypto", cryptoBrowserify);
}

if (typeof globalThis !== "undefined") {
  setGlobal(globalThis, "process", processPolyfill);
  setGlobal(globalThis, "Buffer", Buffer);
  setGlobal(globalThis, "crypto", cryptoBrowserify);
}

// Also set on global if it exists (for Node.js compatibility)
if (typeof global !== "undefined") {
  setGlobal(global, "process", processPolyfill);
  setGlobal(global, "Buffer", Buffer);
  setGlobal(global, "crypto", cryptoBrowserify);
}

// Create a module cache for require() compatibility
const moduleCache: Record<string, unknown> = {
  crypto: cryptoBrowserify,
  buffer: { Buffer },
  process: processPolyfill,
};

// Ensure crypto.createHmac is available (create-hmac expects this)
// crypto-browserify exports createHmac directly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cryptoModule = (cryptoBrowserify as any).default || cryptoBrowserify;
if (cryptoModule && typeof cryptoModule === "object") {
  // Update module cache with the actual crypto module
  moduleCache["crypto"] = cryptoModule;
}

// Make crypto available for CommonJS require() calls (needed by create-hmac)
// This needs to work for both window.require and any internal require() calls
if (typeof window !== "undefined") {
  const windowAny = window as unknown as Record<string, unknown>;
  const globalThisAny = globalThis as unknown as Record<string, unknown>;

  const originalRequire = windowAny.require as
    | ((module: string) => unknown)
    | undefined;
  windowAny.require = function (module: string) {
    if (moduleCache[module]) {
      return moduleCache[module];
    }
    if (originalRequire && typeof originalRequire === "function") {
      try {
        return originalRequire(module);
      } catch {
        // Fall through
      }
    }
    throw new Error(
      `Module ${module} not found. Available: ${Object.keys(moduleCache).join(
        ", "
      )}`
    );
  };

  // Also set require on globalThis
  globalThisAny.require = windowAny.require;
}
