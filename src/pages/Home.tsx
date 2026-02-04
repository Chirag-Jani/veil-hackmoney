import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { JsonRpcProvider, parseEther, Wallet } from "ethers";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Globe,
  History,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ComingSoonModal from "../components/ComingSoonModal";
import ConnectionApproval from "../components/ConnectionApproval";
import DepositModal from "../components/DepositModal";
import SendPrivatelyModal from "../components/SendPrivatelyModal";
import SignApproval from "../components/SignApproval";
import TransferModal from "../components/TransferModal";
import UnlockWallet from "../components/UnlockWallet";
import WithdrawModal from "../components/WithdrawModal";
import type { CheckBalancesResponse, NetworkType } from "../types";
import { getErrorMessage, logError } from "../utils/errorHandler";
import { getEthRPCManager } from "../utils/ethRpcManager";
import {
  generateBurnerKeypair,
  getDecryptedSeed,
  getEthereumWalletForIndex,
  getKeypairForIndex,
  hasWallet,
} from "../utils/keyManager";
import { sendMessage } from "../utils/messaging";
import { getPrivacyCashService } from "../utils/privacyCashService";
import { createRPCManager } from "../utils/rpcManager";
import {
  getActiveNetwork,
  getPrivacyCashMode,
  setActiveBurnerIndex,
  setActiveNetwork,
} from "../utils/settings";
import {
  archiveBurnerWallet,
  formatAddress,
  getAddressFromKeypair,
  getAllBurnerWallets,
  getAllConnectedSites,
  getAllPendingConnections,
  getAllPendingSignRequests,
  getNextAccountNumber,
  getPrivateBalance as getStoredPrivateBalance,
  removeConnectedSite,
  removePendingConnection,
  removePendingSignRequest,
  storeBurnerWallet,
  storeConnectionApproval,
  storePrivateBalance,
  storeSignApproval,
  type BurnerWallet,
  type ConnectedSite,
  type PendingConnectionRequest,
  type PendingSignRequest,
} from "../utils/storage";
import {
  generateTransactionId,
  storeTransaction,
  type Transaction as TransactionRecord,
} from "../utils/transactionHistory";
import {
  extendSession,
  isSessionValid,
  isWalletLocked,
} from "../utils/walletLock";

const Home = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true); // Initial loading state
  const [isLocked, setIsLocked] = useState(true);
  const [hasWalletState, setHasWalletState] = useState(false);
  const [activeWallet, setActiveWallet] = useState<BurnerWallet | null>(null);
  const [burnerWallets, setBurnerWallets] = useState<BurnerWallet[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWalletList, setShowWalletList] = useState(false);
  const [showSitesList, setShowSitesList] = useState(false);
  const [showCopyPopup, setShowCopyPopup] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSendPrivatelyModal, setShowSendPrivatelyModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] =
    useState<string>("This feature");
  const [privateBalance, setPrivateBalance] = useState<number>(0);
  const [isRefreshingPrivateBalance, setIsRefreshingPrivateBalance] =
    useState(false);
  const [password, setPassword] = useState(""); // Store password in memory during session
  const [privacyCashMode, setPrivacyCashMode] = useState<boolean>(false);
  const [solPrice, setSolPrice] = useState<number | null>(null); // SOL price in USD
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnectionRequest | null>(null);
  const [pendingSignRequest, setPendingSignRequest] =
    useState<PendingSignRequest | null>(null);
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>([]);
  const [activeNetwork, setActiveNetworkState] =
    useState<NetworkType>("ethereum");
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const loadWallets = useCallback(
    async (network?: NetworkType) => {
      const net = network ?? activeNetwork;
      try {
        const wallets = await getAllBurnerWallets(net);
        setBurnerWallets(wallets);
        if (wallets.length > 0) {
          const active = wallets.find((w) => w.isActive) || wallets[0];
          setActiveWallet(active);
        } else {
          setActiveWallet(null);
        }
      } catch (error) {
        console.error("[Veil] Error loading wallets:", error);
      }
    },
    [activeNetwork]
  );

  const switchNetwork = useCallback(
    async (network: NetworkType) => {
      setActiveNetworkState(network);
      await setActiveNetwork(network);
      await loadWallets(network);
    },
    [loadWallets]
  );

  // Load connected sites
  const loadConnectedSites = useCallback(async () => {
    try {
      const sites = await getAllConnectedSites();
      setConnectedSites(sites.filter((site) => site.connected));
    } catch (error) {
      console.error("[Veil] Error loading connected sites:", error);
    }
  }, []);

  // Check for pending connection requests
  const checkPendingConnections = useCallback(async () => {
    try {
      const pending = await getAllPendingConnections();
      if (pending.length > 0) {
        setPendingConnection(pending[0]); // Show first pending request
      } else {
        setPendingConnection(null);
      }
    } catch (error) {
      console.error("[Veil] Error checking pending connections:", error);
    }
  }, []);

  // Handle connection approval
  const handleApproveConnection = useCallback(async () => {
    if (!pendingConnection || !activeWallet) return;

    try {
      // Store approval result - background script will handle storing the connected site
      await storeConnectionApproval(
        pendingConnection.id,
        true,
        activeWallet.fullAddress
      );
      setPendingConnection(null);
      // Reload connected sites after approval
      await loadConnectedSites();
    } catch (error) {
      console.error("[Veil] Error approving connection:", error);
    }
  }, [pendingConnection, activeWallet, loadConnectedSites]);

  // Handle connection rejection
  const handleRejectConnection = useCallback(async () => {
    if (!pendingConnection) return;

    try {
      // Store rejection result
      await storeConnectionApproval(pendingConnection.id, false);
      await removePendingConnection(pendingConnection.id);
      setPendingConnection(null);
    } catch (error) {
      console.error("[Veil] Error rejecting connection:", error);
    }
  }, [pendingConnection]);

  // Check for pending sign requests
  const checkPendingSignRequests = useCallback(async () => {
    try {
      const pending = await getAllPendingSignRequests();
      if (pending.length > 0) {
        setPendingSignRequest(pending[0]); // Show first pending request
      } else {
        setPendingSignRequest(null);
      }
    } catch (error) {
      console.error("[Veil] Error checking pending sign requests:", error);
    }
  }, []);

  // Handle sign approval
  const handleApproveSign = useCallback(async () => {
    if (!pendingSignRequest) return;

    try {
      await storeSignApproval(pendingSignRequest.id, true);
      setPendingSignRequest(null);
    } catch (error) {
      console.error("[Veil] Error approving sign:", error);
    }
  }, [pendingSignRequest]);

  // Handle sign rejection
  const handleRejectSign = useCallback(async () => {
    if (!pendingSignRequest) return;

    try {
      await storeSignApproval(pendingSignRequest.id, false);
      await removePendingSignRequest(pendingSignRequest.id);
      setPendingSignRequest(null);
    } catch (error) {
      console.error("[Veil] Error rejecting sign:", error);
    }
  }, [pendingSignRequest]);

  // Handle disconnecting a site
  const handleDisconnectSite = useCallback(
    async (domain: string) => {
      try {
        await removeConnectedSite(domain);
        await loadConnectedSites();
      } catch (error) {
        console.error("[Veil] Error disconnecting site:", error);
      }
    },
    [loadConnectedSites]
  );

  const generateNewBurner = useCallback(
    async (pwd?: string, networkOverride?: NetworkType) => {
      const net = networkOverride ?? activeNetwork;
      let currentPassword = pwd || password;
      if (!currentPassword) {
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
          sessionStorage.removeItem("veil:temp_password");
        }
      }

      if (!currentPassword) {
        setIsLocked(true);
        setPassword("");
        sessionStorage.removeItem("veil:session_password");
        return;
      }

      setIsGenerating(true);
      try {
        const existingWallets = await getAllBurnerWallets(net);
        const activeWallets = existingWallets.filter(
          (w) => w.isActive && !w.archived
        );
        const minBalance = net === "solana" ? 0.001 : 0.0001;

        for (const wallet of activeWallets) {
          if (wallet.balance < minBalance) {
            await archiveBurnerWallet(wallet.index, wallet.network);
          }
        }

        const seed = await getDecryptedSeed(currentPassword);
        const result = await generateBurnerKeypair(seed, net);

        if (net === "solana" && "keypair" in result) {
          const { keypair, index } = result;
          const address = getAddressFromKeypair(keypair);
          const accountNumber = await getNextAccountNumber(net);
          const accountName = `Account ${accountNumber}`;
          const newWallet: BurnerWallet = {
            id: Date.now(),
            address: formatAddress(address),
            fullAddress: address,
            balance: 0,
            site: accountName,
            isActive: true,
            index,
            network: "solana",
          };
          await storeBurnerWallet(newWallet);
          await setActiveBurnerIndex("solana", index);
        } else if (net === "ethereum" && "address" in result) {
          const { address, index } = result;
          const accountNumber = await getNextAccountNumber(net);
          const accountName = `Account ${accountNumber}`;
          const newWallet: BurnerWallet = {
            id: Date.now(),
            address: formatAddress(address),
            fullAddress: address,
            balance: 0,
            site: accountName,
            isActive: true,
            index,
            network: "ethereum",
          };
          await storeBurnerWallet(newWallet);
          await setActiveBurnerIndex("ethereum", index);
        }

        await loadWallets(net);
      } catch (error) {
        // Handle errors gracefully - lock wallet instead of showing alerts
        console.error("[Veil] Error generating burner:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("DOMException") ||
          errorMessage.includes("decrypt") ||
          errorMessage.includes("password")
        ) {
          // Password-related errors - lock wallet
          setIsLocked(true);
          setPassword("");
          sessionStorage.removeItem("veil:session_password");
        } else {
          // Other errors - also lock wallet for security
          setIsLocked(true);
          setPassword("");
          sessionStorage.removeItem("veil:session_password");
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [password, loadWallets, activeNetwork]
  );

  const checkWalletState = useCallback(async () => {
    try {
      const walletExists = await hasWallet();

      if (!walletExists) {
        navigate("/onboarding");
        return;
      }

      const locked = await isWalletLocked();

      // If wallet appears unlocked, validate session expiry
      let shouldBeLocked = locked;
      if (!locked) {
        const sessionValid = await isSessionValid();
        if (!sessionValid) {
          // Session expired - lock the wallet
          shouldBeLocked = true;
          setIsLocked(true);
          setPassword("");
          sessionStorage.removeItem("veil:session_password");
          // Clear chrome storage passwords
          try {
            await chrome.storage.session.remove("veil:session_password");
          } catch {
            // Ignore
          }
          await chrome.storage.local.remove("veil:temp_session_password");
        }
      }

      // Set both states together to avoid race condition
      setHasWalletState(true);
      setIsLocked(shouldBeLocked);
      setIsLoading(false);

      const privacyCashEnabled = await getPrivacyCashMode();
      setPrivacyCashMode(privacyCashEnabled);

      const net = await getActiveNetwork();
      setActiveNetworkState(net);

      if (!shouldBeLocked) {
        const sessionPassword = sessionStorage.getItem("veil:session_password");
        if (sessionPassword && !password) {
          setPassword(sessionPassword);
        }

        await loadWallets(net);

        const wallets = await getAllBurnerWallets(net);
        if (wallets.length === 0 && !isGenerating) {
          // Try to get password from state or sessionStorage
          const currentPassword =
            password ||
            sessionStorage.getItem("veil:session_password") ||
            sessionStorage.getItem("veil:temp_password");
          if (currentPassword) {
            if (!password) {
              setPassword(currentPassword);
            }
            await generateNewBurner(currentPassword, net);
          } else {
            // No password available - lock wallet gracefully
            setIsLocked(true);
            sessionStorage.removeItem("veil:session_password");
          }
        }
      } else {
        // Wallet is locked - clear session password
        sessionStorage.removeItem("veil:session_password");
      }
    } catch (error) {
      // Handle any unexpected errors gracefully
      console.error("[Veil] Error checking wallet state:", error);
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      setIsLoading(false);
    }
  }, [navigate, loadWallets, isGenerating, password, generateNewBurner]);

  // Check wallet state on mount
  useEffect(() => {
    checkWalletState();
  }, [checkWalletState]);

  // Check session validity periodically
  useEffect(() => {
    if (!isLocked) {
      const interval = setInterval(async () => {
        const valid = await isSessionValid();
        if (!valid) {
          setIsLocked(true);
          setPassword(""); // Clear password from memory
          sessionStorage.removeItem("veil:session_password"); // Clear session password
        } else {
          extendSession();
        }
      }, 60000); // Check every minute

      return () => clearInterval(interval);
    }
  }, [isLocked]);

  // Check for pending connection requests
  useEffect(() => {
    if (!isLocked && activeWallet) {
      // Check immediately
      checkPendingConnections();

      // Poll for pending connections every second
      const interval = setInterval(checkPendingConnections, 1000);
      return () => clearInterval(interval);
    }
  }, [isLocked, activeWallet, checkPendingConnections]);

  // Check for pending sign requests
  useEffect(() => {
    if (!isLocked && activeWallet) {
      // Check immediately
      checkPendingSignRequests();

      // Poll for pending sign requests every second
      const interval = setInterval(checkPendingSignRequests, 1000);
      return () => clearInterval(interval);
    }
  }, [isLocked, activeWallet, checkPendingSignRequests]);

  // Load connected sites when sites list is shown
  useEffect(() => {
    if (showSitesList) {
      loadConnectedSites();
    }
  }, [showSitesList, loadConnectedSites]);

  // Fetch SOL price from CoinGecko
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
        );
        if (res.ok) {
          const data = await res.json();
          if (data.solana?.usd) setSolPrice(data.solana.usd);
        }
      } catch (e) {
        console.error("[Veil] Error fetching SOL price:", e);
      }
    };
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch ETH price when on Ethereum network
  useEffect(() => {
    if (activeNetwork !== "ethereum") return;
    const fetchEthPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ethereum?.usd) setEthPrice(data.ethereum.usd);
        }
      } catch (e) {
        console.error("[Veil] Error fetching ETH price:", e);
      }
    };
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [activeNetwork]);

  const handleUnlock = async (unlockPassword: string) => {
    try {
      setPassword(unlockPassword);
      // Store password in sessionStorage for persistence across component remounts
      sessionStorage.setItem("veil:session_password", unlockPassword);

      // Store in chrome.storage for background script access
      // Use both session (preferred) and local (fallback) storage
      try {
        await chrome.storage.session.set({
          "veil:session_password": unlockPassword,
        });
      } catch {
        // chrome.storage.session might not be available
      }
      // Also store in local storage as fallback
      await chrome.storage.local.set({
        "veil:temp_session_password": unlockPassword,
      });

      setIsLocked(false);
      await loadWallets();
      await loadConnectedSites();

      // Auto-generate first burner if none exist
      const wallets = await getAllBurnerWallets();
      if (wallets.length === 0) {
        // Generate burner - errors will be handled gracefully inside
        await generateNewBurner(unlockPassword);
      }

      // Check for pending connection requests immediately
      await checkPendingConnections();
    } catch (error) {
      // Handle unlock errors gracefully - lock wallet again
      console.error("[Veil] Error during unlock:", error);
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
    }
  };

  const totalBalance = burnerWallets.reduce((sum, w) => sum + w.balance, 0);

  const handleCopy = () => {
    if (activeWallet) {
      navigator.clipboard.writeText(activeWallet.fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Load persisted private balance when wallet changes (Solana only)
  const activeWalletIndex = activeWallet?.index;
  useEffect(() => {
    if (
      activeNetwork === "solana" &&
      activeWalletIndex !== undefined &&
      privacyCashMode
    ) {
      getStoredPrivateBalance(activeWalletIndex).then((storedBalance) => {
        if (storedBalance > 0) setPrivateBalance(storedBalance);
      });
    }
  }, [activeNetwork, activeWalletIndex, privacyCashMode]);

  // Initialize Privacy Cash service (Solana only)
  useEffect(() => {
    const getPassword = () => {
      if (password) return password;
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      if (sessionPassword) {
        setPassword(sessionPassword);
        return sessionPassword;
      }
      return null;
    };

    const currentPassword = getPassword();

    if (
      activeNetwork === "solana" &&
      !isLocked &&
      activeWalletIndex !== undefined &&
      currentPassword &&
      privacyCashMode
    ) {
      let isMounted = true;

      const initializePrivacyCash = async () => {
        try {
          const service = getPrivacyCashService();

          // Skip if already initialized for this wallet
          const currentPubKey = service.getCurrentPublicKey();
          // Use getKeypairForIndex to handle private key imports correctly
          const keypair = await getKeypairForIndex(
            currentPassword,
            activeWalletIndex
          );
          const newPubKey = keypair.publicKey.toBase58();

          if (currentPubKey === newPubKey) {
            // Already initialized for this wallet, just refresh balance from API
            const balance = await service.getPrivateBalance();
            if (isMounted) {
              setPrivateBalance(balance);
              // Persist to storage
              await storePrivateBalance(activeWalletIndex, balance);
            }
            return;
          }

          await service.initialize(keypair);
          if (!isMounted) return;

          // Load private balance from API
          const balance = await service.getPrivateBalance();
          if (isMounted) {
            setPrivateBalance(balance);
            // Persist to storage
            await storePrivateBalance(activeWalletIndex, balance);
          }
        } catch (error) {
          console.error("[Veil] Error initializing Privacy Cash:", error);
          // Don't reset to 0 - keep the persisted balance
        }
      };

      initializePrivacyCash();

      return () => {
        isMounted = false;
      };
    }
  }, [isLocked, activeWalletIndex, password, privacyCashMode]);

  // Periodically refresh balances and check for incoming SOL
  // Only depend on activeWalletIndex to prevent re-triggering loops
  useEffect(() => {
    if (!isLocked && activeWalletIndex !== undefined) {
      let isMounted = true;

      // Balance check function
      const checkBalances = async () => {
        if (!isMounted) return;

        try {
          const response = await sendMessage<CheckBalancesResponse>({
            type: "checkBalances",
          });
          if (!isMounted) return;

          if (
            "success" in response &&
            response.success &&
            "updates" in response &&
            response.updates
          ) {
            // Only update the wallet list, don't change active wallet
            const updatedWallets = await getAllBurnerWallets();
            if (!isMounted) return;

            setBurnerWallets(updatedWallets);

            // Update active wallet balance only (same index)
            const updatedActiveWallet = updatedWallets.find(
              (w) => w.index === activeWalletIndex
            );
            if (updatedActiveWallet) {
              setActiveWallet(updatedActiveWallet);
            }
          }
        } catch (error) {
          console.error("[Veil] Error checking balances:", error);
        }
      };

      // Check immediately
      checkBalances();

      // Then check at configured interval (default 30 seconds)
      const envInterval = import.meta.env.VITE_BALANCE_CHECK_INTERVAL_MS
        ? parseInt(import.meta.env.VITE_BALANCE_CHECK_INTERVAL_MS, 10)
        : 30000;
      const validatedInterval = Math.max(5000, Math.min(300000, envInterval));
      const interval = setInterval(checkBalances, validatedInterval);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
  }, [isLocked, activeWalletIndex]);

  // Deposit handler using real Privacy Cash service
  const handleDeposit = async (amount: number): Promise<void> => {
    if (!privacyCashMode) {
      throw new Error("Privacy Cash mode is not enabled");
    }
    if (!activeWallet) {
      throw new Error("No active wallet selected");
    }

    // Validate session expiry first
    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error(
        "Session expired. Please close this dialog, unlock your wallet, and try again."
      );
    }

    // Try to get password from state or storage
    let currentPassword = password;
    if (!currentPassword) {
      // Check sessionStorage first
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      if (sessionPassword) {
        currentPassword = sessionPassword;
        setPassword(sessionPassword);
      } else {
        // Check chrome.storage.session
        try {
          const sessionData = await chrome.storage.session.get(
            "veil:session_password"
          );
          if (sessionData["veil:session_password"]) {
            currentPassword = sessionData["veil:session_password"] as string;
            setPassword(currentPassword);
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // Ignore
        }
      }

      // If still no password, check temp password in sessionStorage
      if (!currentPassword) {
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
        }
      }

      // Final fallback: check chrome.storage.local
      if (!currentPassword) {
        try {
          const localData = await chrome.storage.local.get(
            "veil:temp_session_password"
          );
          if (localData["veil:temp_session_password"]) {
            currentPassword = localData["veil:temp_session_password"] as string;
            setPassword(currentPassword);
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!currentPassword) {
      // Password not available after checking all storage - lock wallet
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error(
        "Session expired. Please close this dialog, unlock your wallet, and try again."
      );
    }

    const txId = generateTransactionId();
    const privateBalanceBefore = privateBalance;

    // Record pending transaction
    const transaction: TransactionRecord = {
      id: txId,
      type: "deposit",
      timestamp: Date.now(),
      amount,
      fromAddress: activeWallet.fullAddress,
      walletIndex: activeWallet.index,
      status: "pending",
      privateBalanceBefore,
    };
    await storeTransaction(transaction);

    try {
      const service = getPrivacyCashService();

      // Ensure service is initialized
      if (!service.isInitialized()) {
        const keypair = await getKeypairForIndex(
          currentPassword,
          activeWallet.index
        );
        await service.initialize(keypair);
      }

      // Convert SOL to lamports
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Deposit to Privacy Cash
      const result = await service.deposit(lamports);

      // Clear cache and wait for UTXOs to appear on-chain
      await service.clearCache();

      // Wait a bit for the transaction to be confirmed and UTXOs to be indexed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Refresh balances with retry
      let newPrivateBalance = await service.getPrivateBalance();

      // If balance is still 0, wait a bit more and retry (UTXOs might take time to index)
      if (newPrivateBalance === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await service.clearCache();
        newPrivateBalance = await service.getPrivateBalance();
      }

      setPrivateBalance(newPrivateBalance);

      // Persist to storage
      await storePrivateBalance(activeWallet.index, newPrivateBalance);

      // Reload wallets to update burner wallet balance
      await loadWallets();

      // Update transaction as confirmed
      transaction.status = "confirmed";
      transaction.signature = result.tx;
      transaction.privateBalanceAfter = newPrivateBalance;
      await storeTransaction(transaction);
    } catch (error) {
      logError(error, "depositing to Privacy Cash");

      // Update transaction as failed
      transaction.status = "failed";
      transaction.error = getErrorMessage(error, "depositing funds");
      await storeTransaction(transaction);

      throw error;
    }
  };

  // Withdraw handler using real Privacy Cash service
  const handleWithdraw = async (
    amount: number,
    recipient?: string
  ): Promise<void> => {
    if (!privacyCashMode) {
      throw new Error("Privacy Cash mode is not enabled");
    }
    if (!activeWallet) {
      throw new Error("No active wallet selected");
    }

    // Validate session expiry first
    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error(
        "Session expired. Please close this dialog, unlock your wallet, and try again."
      );
    }

    // Try to get password from state or storage
    let currentPassword = password;
    if (!currentPassword) {
      // Check sessionStorage first
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      if (sessionPassword) {
        currentPassword = sessionPassword;
        setPassword(sessionPassword);
      } else {
        // Check chrome.storage.session
        try {
          const sessionData = await chrome.storage.session.get(
            "veil:session_password"
          );
          if (sessionData["veil:session_password"]) {
            currentPassword = sessionData["veil:session_password"] as string;
            setPassword(currentPassword);
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // Ignore
        }
      }

      // If still no password, check temp password in sessionStorage
      if (!currentPassword) {
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
        }
      }

      // Final fallback: check chrome.storage.local
      if (!currentPassword) {
        try {
          const localData = await chrome.storage.local.get(
            "veil:temp_session_password"
          );
          if (localData["veil:temp_session_password"]) {
            currentPassword = localData["veil:temp_session_password"] as string;
            setPassword(currentPassword);
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!currentPassword) {
      // Password not available after checking all storage - lock wallet
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error(
        "Session expired. Please close this dialog, unlock your wallet, and try again."
      );
    }

    const txId = generateTransactionId();
    const privateBalanceBefore = privateBalance;
    const toAddress = recipient || activeWallet.fullAddress;

    // Record pending transaction
    const transaction: TransactionRecord = {
      id: txId,
      type: "withdraw",
      timestamp: Date.now(),
      amount,
      fromAddress: activeWallet.fullAddress,
      toAddress,
      walletIndex: activeWallet.index,
      status: "pending",
      privateBalanceBefore,
    };
    await storeTransaction(transaction);

    try {
      console.log("[Veil] Starting withdraw:", {
        amount,
        recipient: recipient || activeWallet.fullAddress,
        walletIndex: activeWallet.index,
      });

      const service = getPrivacyCashService();

      // Ensure service is initialized
      if (!service.isInitialized()) {
        console.log(
          "[Veil] Service not initialized, initializing for withdraw..."
        );
        const keypair = await getKeypairForIndex(
          currentPassword,
          activeWallet.index
        );
        await service.initialize(keypair);
      }

      // Convert SOL to lamports
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      console.log("[Veil] Withdrawing", lamports, "lamports (", amount, "SOL)");

      // Validate recipient address if provided
      if (recipient) {
        try {
          new PublicKey(recipient);
        } catch {
          throw new Error(`Invalid recipient address: ${recipient}`);
        }
      }

      // Withdraw from Privacy Cash
      console.log("[Veil] Calling Privacy Cash withdraw...");
      const result = await service.withdraw(lamports, recipient);
      console.log("[Veil] Withdraw result:", result);

      // Refresh private balance
      console.log("[Veil] Refreshing private balance after withdraw...");
      const newBalance = await service.getPrivateBalance();
      console.log("[Veil] New private balance:", newBalance);

      setPrivateBalance(newBalance);

      // Persist to storage
      await storePrivateBalance(activeWallet.index, newBalance);

      // Update transaction as confirmed
      transaction.status = "confirmed";
      transaction.signature = result.tx;
      transaction.privateBalanceAfter = newBalance;
      await storeTransaction(transaction);

      console.log("[Veil] Withdraw completed successfully");
    } catch (error) {
      console.error("[Veil] Withdraw error details:", error);
      if (error instanceof Error) {
        console.error("[Veil] Error message:", error.message);
        console.error("[Veil] Error stack:", error.stack);
      }
      logError(error, "withdrawing from Privacy Cash");

      // Update transaction as failed
      transaction.status = "failed";
      transaction.error = getErrorMessage(error, "withdrawing funds");
      await storeTransaction(transaction);

      throw error;
    }
  };

  // Combined deposit and withdraw handler for streamlined private sending
  // This is always available as a main action button (doesn't require privacy cash mode toggle)
  const handleSendPrivately = async (
    amount: number,
    recipient?: string
  ): Promise<void> => {
    console.log("[Veil] handleSendPrivately called with:", {
      amount,
      recipient,
    });

    if (!activeWallet) {
      console.error("[Veil] No active wallet!");
      throw new Error("No active wallet selected");
    }
    console.log("[Veil] Active wallet:", activeWallet.fullAddress);

    // Check if wallet is actually locked
    const walletLocked = await isWalletLocked();
    if (walletLocked) {
      console.error("[Veil] Wallet is locked!");
      setIsLocked(true);
      throw new Error("Wallet is locked. Please unlock your wallet first.");
    }

    // Validate session expiry
    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      console.error("[Veil] Session expired. Locking wallet.");
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      // Clear chrome storage passwords
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error("Session expired. Please unlock your wallet again.");
    }

    // Try to get password from state or storage
    let currentPassword = password;
    console.log(
      "[Veil] Password from state:",
      currentPassword ? "exists" : "null"
    );

    if (!currentPassword) {
      // Check sessionStorage first
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      console.log(
        "[Veil] Session password (sessionStorage):",
        sessionPassword ? "exists" : "null"
      );
      if (sessionPassword) {
        currentPassword = sessionPassword;
        setPassword(sessionPassword);
      } else {
        // Check chrome.storage.session
        try {
          const sessionData = await chrome.storage.session.get(
            "veil:session_password"
          );
          if (sessionData["veil:session_password"]) {
            currentPassword = sessionData["veil:session_password"] as string;
            console.log(
              "[Veil] Session password (chrome.storage.session): exists"
            );
            setPassword(currentPassword);
            // Also sync to sessionStorage for consistency
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          console.log("[Veil] chrome.storage.session not available");
        }
      }

      // If still no password, check temp password in sessionStorage
      if (!currentPassword) {
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        console.log(
          "[Veil] Temp password (sessionStorage):",
          tempPassword ? "exists" : "null"
        );
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
        }
      }

      // Final fallback: check chrome.storage.local
      if (!currentPassword) {
        try {
          const localData = await chrome.storage.local.get(
            "veil:temp_session_password"
          );
          if (localData["veil:temp_session_password"]) {
            currentPassword = localData["veil:temp_session_password"] as string;
            console.log("[Veil] Temp password (chrome.storage.local): exists");
            setPassword(currentPassword);
            // Also sync to sessionStorage for consistency
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          console.log("[Veil] chrome.storage.local not available");
        }
      }
    }

    if (!currentPassword) {
      // Password not available - need to re-unlock
      console.error("[Veil] No password available!");
      throw new Error(
        "Session expired. Please close this dialog, unlock your wallet, and try again."
      );
    }
    console.log("[Veil] Password obtained successfully");

    const txId = generateTransactionId();
    const privateBalanceBefore = privateBalance;
    const toAddress = recipient || activeWallet.fullAddress;

    // Record pending transaction
    const transaction: TransactionRecord = {
      id: txId,
      type: "deposit_and_withdraw",
      timestamp: Date.now(),
      amount,
      fromAddress: activeWallet.fullAddress,
      toAddress,
      walletIndex: activeWallet.index,
      status: "pending",
      privateBalanceBefore,
    };
    await storeTransaction(transaction);

    try {
      console.log("[Veil] Starting send privately:", {
        amount,
        recipient: recipient || activeWallet.fullAddress,
        walletIndex: activeWallet.index,
      });

      const service = getPrivacyCashService();

      // Ensure service is initialized
      if (!service.isInitialized()) {
        console.log("[Veil] Service not initialized, initializing...");
        const keypair = await getKeypairForIndex(
          currentPassword,
          activeWallet.index
        );
        await service.initialize(keypair);
      }

      // Convert SOL to lamports
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      console.log(
        "[Veil] Sending privately",
        lamports,
        "lamports (",
        amount,
        "SOL)"
      );

      // Validate recipient address if provided
      if (recipient) {
        try {
          new PublicKey(recipient);
        } catch {
          throw new Error(`Invalid recipient address: ${recipient}`);
        }
      }

      // Deposit and withdraw in one operation
      console.log("[Veil] Calling Privacy Cash depositAndWithdraw...");
      const result = await service.depositAndWithdraw(lamports, recipient);
      console.log("[Veil] Send privately result:", result);

      // Clear cache and wait for UTXOs to be processed
      await service.clearCache();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Refresh private balance
      console.log("[Veil] Refreshing private balance...");
      const newBalance = await service.getPrivateBalance();
      console.log("[Veil] New private balance:", newBalance);

      setPrivateBalance(newBalance);

      // Persist to storage
      await storePrivateBalance(activeWallet.index, newBalance);

      // Reload wallets to update burner wallet balance
      await loadWallets();

      // Update transaction as confirmed
      transaction.status = "confirmed";
      transaction.signature = result.withdrawTx; // Use withdraw tx as the final transaction
      transaction.privateBalanceAfter = newBalance;
      await storeTransaction(transaction);

      console.log("[Veil] Send privately completed successfully");
    } catch (error) {
      console.error("[Veil] Send privately error details:", error);
      if (error instanceof Error) {
        console.error("[Veil] Error message:", error.message);
        console.error("[Veil] Error stack:", error.stack);
      }
      logError(error, "sending funds privately");

      // Update transaction as failed
      transaction.status = "failed";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      transaction.error = getErrorMessage(error, "sending funds privately");
      await storeTransaction(transaction);

      // Re-throw with more context if needed
      if (error instanceof Error) {
        throw new Error(`Failed to send privately: ${errorMessage}`);
      }
      throw error;
    }
  };

  // Refresh private balance manually
  const refreshPrivateBalance = async () => {
    if (!privacyCashMode) {
      console.warn("[Veil] Privacy Cash mode is not enabled");
      return;
    }

    if (!activeWallet) {
      console.warn("[Veil] No active wallet selected");
      return;
    }

    // Try to get password from state or sessionStorage
    let currentPassword = password;
    if (!currentPassword) {
      // Check session password first (persistent across remounts)
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      if (sessionPassword) {
        currentPassword = sessionPassword;
        setPassword(sessionPassword); // Restore to state
      } else {
        // Fallback to temp password (for first-time generation)
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
        }
      }
    }

    // Check if wallet is actually locked
    const walletLocked = await isWalletLocked();
    if (walletLocked) {
      console.warn("[Veil] Wallet is locked. Please unlock first.");
      setIsLocked(true);
      return;
    }

    // Validate session expiry
    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      console.warn("[Veil] Session expired. Locking wallet.");
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      return;
    }

    // If password is not available but wallet is unlocked, just reload from storage
    if (!currentPassword) {
      console.log(
        "[Veil] Password not available, reloading from persisted storage..."
      );
      setIsRefreshingPrivateBalance(true);
      try {
        const storedBalance = await getStoredPrivateBalance(activeWallet.index);
        setPrivateBalance(storedBalance);
        console.log("[Veil] Reloaded balance from storage:", storedBalance);
      } catch (error) {
        console.error("[Veil] Error reloading from storage:", error);
      } finally {
        setIsRefreshingPrivateBalance(false);
      }
      return;
    }

    setIsRefreshingPrivateBalance(true);
    try {
      console.log("[Veil] Starting private balance refresh...");
      const service = getPrivacyCashService();

      // Ensure service is initialized
      if (!service.isInitialized()) {
        console.log("[Veil] Service not initialized, initializing now...");
        const keypair = await getKeypairForIndex(
          currentPassword,
          activeWallet.index
        );
        await service.initialize(keypair);
      }

      // Clear cache and refresh
      console.log("[Veil] Clearing cache...");
      await service.clearCache();

      // Wait a moment for cache to clear
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log("[Veil] Fetching private balance...");
      const newBalance = await service.getPrivateBalance();
      console.log("[Veil] New balance:", newBalance);

      setPrivateBalance(newBalance);

      // Persist to storage
      await storePrivateBalance(activeWallet.index, newBalance);

      if (newBalance === 0) {
        console.warn(
          "[Veil] Balance is still 0 after refresh. Check console for errors."
        );
      }
    } catch (error) {
      console.error("[Veil] Error refreshing private balance:", error);
      if (error instanceof Error) {
        console.error("[Veil] Error message:", error.message);
        console.error("[Veil] Error stack:", error.stack);
      }
      // Show error to user somehow? Or just log it
    } finally {
      setIsRefreshingPrivateBalance(false);
    }
  };

  // Transfer handler for moving SOL between wallets
  const handleTransfer = async (
    amount: number,
    recipient: string
  ): Promise<string> => {
    if (!activeWallet) {
      throw new Error("No active wallet selected");
    }

    // Check if wallet is actually locked
    const walletLocked = await isWalletLocked();
    if (walletLocked) {
      throw new Error("Wallet is locked. Please unlock your wallet first.");
    }

    // Validate session expiry
    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      // Clear chrome storage passwords
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error("Session expired. Please unlock your wallet again.");
    }

    // Try to get password from state or storage
    let currentPassword = password;
    if (!currentPassword) {
      // Check sessionStorage first
      const sessionPassword = sessionStorage.getItem("veil:session_password");
      if (sessionPassword) {
        currentPassword = sessionPassword;
        setPassword(sessionPassword);
      } else {
        // Check chrome.storage.session
        try {
          const sessionData = await chrome.storage.session.get(
            "veil:session_password"
          );
          if (sessionData["veil:session_password"]) {
            currentPassword = sessionData["veil:session_password"] as string;
            setPassword(currentPassword);
            // Also sync to sessionStorage for consistency
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // chrome.storage.session not available
        }
      }

      // If still no password, check temp password in sessionStorage
      if (!currentPassword) {
        const tempPassword = sessionStorage.getItem("veil:temp_password");
        if (tempPassword) {
          currentPassword = tempPassword;
          setPassword(tempPassword);
        }
      }

      // Final fallback: check chrome.storage.local
      if (!currentPassword) {
        try {
          const localData = await chrome.storage.local.get(
            "veil:temp_session_password"
          );
          if (localData["veil:temp_session_password"]) {
            currentPassword = localData["veil:temp_session_password"] as string;
            setPassword(currentPassword);
            // Also sync to sessionStorage for consistency
            sessionStorage.setItem("veil:session_password", currentPassword);
          }
        } catch {
          // chrome.storage.local not available
        }
      }
    }

    if (!currentPassword) {
      // If wallet is unlocked but password not found after checking all storage, lock wallet
      setIsLocked(true);
      setPassword("");
      sessionStorage.removeItem("veil:session_password");
      // Clear chrome storage passwords
      try {
        await chrome.storage.session.remove("veil:session_password");
      } catch {
        // Ignore
      }
      await chrome.storage.local.remove("veil:temp_session_password");
      throw new Error("Session expired. Please unlock your wallet again.");
    }

    const txId = generateTransactionId();
    const transaction: TransactionRecord = {
      id: txId,
      type: "transfer",
      timestamp: Date.now(),
      amount,
      fromAddress: activeWallet.fullAddress,
      toAddress: recipient,
      walletIndex: activeWallet.index,
      status: "pending",
    };
    await storeTransaction(transaction);

    if (activeWallet.network === "ethereum") {
      const feeEstimateEth = 0.001;
      const requiredBalanceEth = amount + feeEstimateEth;
      if (activeWallet.balance < requiredBalanceEth) {
        transaction.status = "failed";
        transaction.error = `Insufficient balance. Need at least ${requiredBalanceEth.toFixed(
          6
        )} ETH (including gas).`;
        await storeTransaction(transaction);
        throw new Error(transaction.error);
      }
      try {
        const { privateKey } = await getEthereumWalletForIndex(
          currentPassword,
          activeWallet.index
        );
        const ethRpc = getEthRPCManager();
        const tx = await ethRpc.executeWithRetry(async (rpcUrl) => {
          const provider = new JsonRpcProvider(rpcUrl);
          const wallet = new Wallet(privateKey, provider);
          return wallet.sendTransaction({
            to: recipient,
            value: parseEther(amount.toString()),
          });
        });
        transaction.status = "confirmed";
        transaction.signature = tx.hash;
        await storeTransaction(transaction);
        await loadWallets(activeNetwork);
        return tx.hash;
      } catch (err) {
        transaction.status = "failed";
        transaction.error = getErrorMessage(err, "transferring ETH");
        await storeTransaction(transaction);
        throw err;
      }
    }

    const feeEstimate = 0.000005; // ~5000 lamports
    const requiredBalance = amount + feeEstimate;
    if (activeWallet.balance < requiredBalance) {
      transaction.status = "failed";
      transaction.error = `Insufficient balance. You need at least ${requiredBalance.toFixed(
        6
      )} SOL (including transaction fees).`;
      await storeTransaction(transaction);
      throw new Error(transaction.error);
    }

    try {
      const rpcManager = createRPCManager();
      const keypair = await getKeypairForIndex(
        currentPassword,
        activeWallet.index
      );

      console.log("[Veil] Starting transfer:", {
        from: keypair.publicKey.toBase58(),
        to: recipient,
        amount,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      });

      const signature = await rpcManager.executeWithRetry(
        async (connection) => {
          try {
            const recipientPubkey = new PublicKey(recipient);
            const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

            console.log("[Veil] Getting latest blockhash...");
            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } =
              await connection.getLatestBlockhash("confirmed");

            console.log("[Veil] Creating transaction...");
            // Create transfer transaction
            const tx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: recipientPubkey,
                lamports,
              })
            );

            tx.recentBlockhash = blockhash;
            tx.feePayer = keypair.publicKey;

            console.log("[Veil] Signing transaction...");
            // Sign transaction
            tx.sign(keypair);

            console.log("[Veil] Sending transaction...");
            // Send transaction
            const sig = await connection.sendRawTransaction(tx.serialize(), {
              skipPreflight: false,
              maxRetries: 3,
            });

            console.log("[Veil] Transaction sent, signature:", sig);

            // Confirm transaction (non-blocking - don't fail if confirmation times out)
            // The transaction is already sent and will process on-chain
            try {
              console.log("[Veil] Confirming transaction...");

              // Use Promise.race with timeout to prevent hanging
              const confirmationPromise = connection.confirmTransaction(
                {
                  signature: sig,
                  blockhash,
                  lastValidBlockHeight,
                },
                "confirmed"
              );

              // 20 second timeout for confirmation
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () => reject(new Error("Confirmation timeout")),
                  20000
                );
              });

              await Promise.race([confirmationPromise, timeoutPromise]);
              console.log("[Veil] Transaction confirmed");
            } catch (confirmError) {
              // Transaction was sent successfully - confirmation timeout/error is not a failure
              // The transaction will process on-chain even if we can't confirm it here
              // This is expected behavior - confirmation can timeout but transaction still succeeds
              const errorMsg =
                confirmError instanceof Error
                  ? confirmError.message
                  : String(confirmError);
              if (
                errorMsg.includes("timeout") ||
                errorMsg.includes("expired") ||
                errorMsg.includes("block height")
              ) {
                console.log(
                  "[Veil] Transaction sent successfully. Confirmation timed out, but transaction is processing on-chain."
                );
              } else {
                console.log(
                  "[Veil] Transaction sent successfully. Confirmation may take longer, but transaction is processing.",
                  errorMsg
                );
              }
              // Don't throw - transaction was sent, that's success
            }

            return sig;
          } catch (stepError) {
            console.error("[Veil] Error in transfer step:", stepError);
            throw stepError;
          }
        }
      );

      // Reload wallets to update balance
      await loadWallets();

      // Update transaction as confirmed
      transaction.status = "confirmed";
      transaction.signature = signature;
      await storeTransaction(transaction);

      return signature;
    } catch (error) {
      console.error("[Veil] Transfer error details:", error);
      logError(error, "transferring SOL");

      // Update transaction as failed
      transaction.status = "failed";
      const errorMessage = getErrorMessage(error, "transferring funds");
      transaction.error = errorMessage;
      await storeTransaction(transaction);

      // Re-throw with more context
      const enhancedError =
        error instanceof Error
          ? new Error(`${errorMessage}: ${error.message}`)
          : new Error(errorMessage);
      throw enhancedError;
    }
  };

  // Show loading state during initial check
  if (isLoading) {
    return (
      <div className="h-full w-full bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Show unlock screen if wallet is locked
  if (isLocked && hasWalletState) {
    return <UnlockWallet onUnlock={handleUnlock} />;
  }

  // Show loading state while generating first burner
  if (!activeWallet && burnerWallets.length === 0) {
    return (
      <div className="h-full w-full bg-black text-white flex items-center justify-center">
        <div className="text-center">
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-gray-400">Setting up your private wallet...</p>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">No private addresses yet</p>
              <button
                onClick={() => generateNewBurner()}
                className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200"
              >
                Create First Address
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black text-white relative flex flex-col overflow-hidden font-sans">
      {/* Ambient Background */}
      <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-purple-600/10 rounded-full blur-[60px]" />
      <div className="absolute bottom-[50px] left-[-30px] w-32 h-32 bg-blue-600/10 rounded-full blur-[40px]" />

      {/* Header & Wallet Selector */}
      <div className="flex justify-between items-center z-10 px-3 py-3 relative gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowWalletList(true)}
            className="flex items-center gap-3 transition-all group text-left"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
              <img
                src="/veil_shield.png"
                alt="Veil"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[11px] text-gray-500 font-medium leading-none mb-0.5">
                @veil
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white tracking-tight">
                  {activeWallet?.site || "No site"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 transition-colors" />
              </div>
            </div>
          </button>

          <div className="flex items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCopyPopup(!showCopyPopup);
              }}
              className={`p-1 mt-3 rounded-md transition-colors relative z-[60] ${
                showCopyPopup
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {/* Address Copy Popup (Phantom style) moved to root level */}
          </div>
        </div>

        <div className="flex gap-1 pt-0.5">
          <button
            onClick={() => setShowSitesList(true)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 relative"
          >
            <Globe className="w-4 h-4 text-gray-400" />
            {connectedSites.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                {connectedSites.length}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/history")}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
          >
            <History className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-3 pt-2 pb-3 z-10 flex flex-col overflow-y-auto">
        {/* Network switcher – minimal bar above balance */}
        <div
          role="tablist"
          aria-label="Network"
          className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5 mb-3"
        >
          <button
            role="tab"
            aria-selected={activeNetwork === "ethereum"}
            onClick={() => switchNetwork("ethereum")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNetwork === "ethereum"
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Ethereum
          </button>
          <button
            role="tab"
            aria-selected={activeNetwork === "solana"}
            onClick={() => switchNetwork("solana")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              activeNetwork === "solana"
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Solana
          </button>
        </div>

        {/* Total Balance Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center mt-0 mb-4"
        >
          <h1 className="text-4xl font-bold text-white mb-1">
            $
            {(
              totalBalance *
              (activeNetwork === "ethereum"
                ? ethPrice ?? 2400
                : solPrice ?? 145)
            ).toFixed(2)}
          </h1>
          <p className="text-sm text-gray-400">
            {totalBalance.toFixed(activeNetwork === "ethereum" ? 6 : 4)}{" "}
            {activeNetwork === "ethereum" ? "ETH" : "SOL"}
          </p>
        </motion.div>

        {/* Action Buttons - Transfer, Private Transfer (Solana only), Swap */}
        <div
          className={`grid gap-2.5 mb-4 ${
            activeNetwork === "solana" ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          <button
            onClick={() => {
              if (activeWallet && activeWallet.balance > 0) {
                setShowTransferModal(true);
              }
            }}
            disabled={!activeWallet || (activeWallet?.balance ?? 0) === 0}
            className="group flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-150 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            <Send className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-colors" />
            <span className="text-xs font-medium text-white">Transfer</span>
          </button>
          {activeNetwork === "solana" && (
            <button
              onClick={() => {
                if (activeWallet && activeWallet.balance > 0) {
                  setShowSendPrivatelyModal(true);
                }
              }}
              disabled={!activeWallet || (activeWallet?.balance ?? 0) === 0}
              className="group flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-gradient-to-br from-purple-600/80 to-pink-500/80 hover:from-purple-500/90 hover:to-pink-400/90 transition-all duration-150 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            >
              <Shield className="w-5 h-5 text-white" />
              <span className="text-xs font-medium text-white text-center leading-tight">
                Private Transfer
              </span>
            </button>
          )}
          <button
            onClick={() => {
              setComingSoonFeature("Swap");
              setShowComingSoonModal(true);
            }}
            className="group flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-150 rounded-2xl active:scale-[0.97]"
          >
            <ArrowDownUp className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
            <span className="text-xs font-medium text-white">Swap</span>
          </button>
        </div>

        {/* Tokens Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Tokens</h2>
          </div>

          {/* Native Token Card (SOL or ETH) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl bg-white/5 border border-white/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  {activeNetwork === "solana" ? (
                    <img
                      src={
                        typeof chrome !== "undefined" && chrome.runtime
                          ? chrome.runtime.getURL("solana.svg")
                          : "/solana.svg"
                      }
                      alt="Solana"
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector(".fallback-text")) {
                          const fallback = document.createElement("span");
                          fallback.className =
                            "fallback-text text-white font-bold text-sm";
                          fallback.textContent = "SOL";
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-white font-bold text-sm">ETH</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white">
                      {activeNetwork === "solana" ? "Solana" : "Ethereum"}
                    </span>
                    <Check className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalBalance.toFixed(activeNetwork === "ethereum" ? 6 : 5)}{" "}
                    {activeNetwork === "ethereum" ? "ETH" : "SOL"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">
                  $
                  {(
                    totalBalance *
                    (activeNetwork === "ethereum"
                      ? ethPrice ?? 2400
                      : solPrice ?? 145)
                  ).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">-</p>
              </div>
            </div>
          </motion.div>

          {/* Private Balance Card - Solana only, when Privacy Cash mode is enabled */}
          {activeNetwork === "solana" && privacyCashMode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white">
                        Private SOL
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {privateBalance.toFixed(5)} SOL
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshPrivateBalance}
                    disabled={isRefreshingPrivateBalance}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
                    title="Refresh private balance"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-purple-400 ${
                        isRefreshingPrivateBalance ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-purple-300">
                      ${(privateBalance * (solPrice || 145)).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">-</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Additional Actions */}
        <div className="flex flex-col gap-2 mb-2">
          {/* Privacy Cash buttons - Solana only */}
          {activeNetwork === "solana" && privacyCashMode && (
            <>
              {/* Deposit to Privacy - Standalone */}
              {activeWallet && activeWallet.balance > 0 && (
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="py-2.5 px-4 font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-all bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-[0.98]"
                >
                  <Shield className="w-4 h-4" />
                  <span>Deposit to Privacy</span>
                </button>
              )}

              {/* Withdraw from Privacy - Standalone */}
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={privateBalance <= 0}
                className={`py-2.5 px-4 font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-all ${
                  privateBalance > 0
                    ? "bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-[0.98]"
                    : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                }`}
              >
                <ArrowUp className="w-4 h-4" />
                <span>Withdraw from Privacy</span>
              </button>
            </>
          )}

          <button
            onClick={() => generateNewBurner()}
            disabled={isGenerating || (activeWallet?.balance ?? 0) > 0}
            className={`py-2.5 px-4 font-medium rounded-xl text-sm border flex items-center justify-center gap-2 transition-all ${
              !activeWallet || (activeWallet.balance ?? 0) === 0
                ? "bg-white/5 text-white border-white/20 hover:bg-white/10 hover:border-white/30 active:scale-[0.98]"
                : "bg-white/5 text-gray-600 border-white/5 cursor-not-allowed"
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
            />
            <span>{isGenerating ? "Generating..." : "New Address"}</span>
          </button>
        </div>
      </div>

      {/* Wallet List Modal */}
      <AnimatePresence>
        {showWalletList && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWalletList(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-30 border-t border-white/10"
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-8 h-1 bg-white/20 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3">
                <h3 className="text-sm font-bold text-white">
                  Private Addresses
                </h3>
                <button
                  onClick={() => setShowWalletList(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="px-3 pb-3 max-h-64 overflow-y-auto">
                {burnerWallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={async () => {
                      setActiveWallet(wallet);
                      await setActiveBurnerIndex(wallet.network, wallet.index);
                      setShowWalletList(false);
                    }}
                    className={`w-full p-2.5 rounded-lg flex items-center gap-2.5 transition-colors mb-1.5 ${
                      activeWallet?.id === wallet.id
                        ? "bg-white/10 border border-white/20"
                        : "bg-white/5 border border-transparent hover:bg-white/10"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src="/veil_shield.png"
                        alt="Veil"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white">
                          {wallet.site}
                        </span>
                        {activeWallet?.id === wallet.id && (
                          <span className="px-1 py-0.5 text-[8px] bg-green-500/20 text-green-400 rounded font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <code className="text-[10px] text-gray-500 font-mono">
                        {wallet.address}
                      </code>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-white">
                        {wallet.balance}{" "}
                        {wallet.network === "ethereum" ? "ETH" : "SOL"}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        $
                        {(
                          wallet.balance *
                          (wallet.network === "ethereum"
                            ? ethPrice ?? 2400
                            : solPrice ?? 145)
                        ).toFixed(2)}
                      </p>
                    </div>
                  </button>
                ))}

                <button
                  onClick={() => {
                    setShowWalletList(false);
                    generateNewBurner();
                  }}
                  disabled={isGenerating}
                  className="w-full p-2.5 rounded-lg flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 transition-colors mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-400">
                    Create New Address
                  </span>
                </button>
              </div>

              <div className="px-4 py-3 border-t border-white/10 bg-black/20">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Total Balance</span>
                  <span className="text-sm font-bold text-white">
                    {totalBalance.toFixed(activeNetwork === "ethereum" ? 4 : 2)}{" "}
                    {activeNetwork === "ethereum" ? "ETH" : "SOL"}
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Connected Sites Modal */}
      <AnimatePresence>
        {showSitesList && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSitesList(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-30 border-t border-white/10"
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-8 h-1 bg-white/20 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3">
                <h3 className="text-sm font-bold text-white">
                  Connected Sites
                </h3>
                <button
                  onClick={() => setShowSitesList(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="px-3 pb-4 max-h-64 overflow-y-auto">
                {connectedSites.length === 0 ? (
                  <div className="text-center py-6">
                    <Globe className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-xs">No connected sites</p>
                    <p className="text-gray-600 text-[10px] mt-2">
                      Site connections will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connectedSites.map((site) => {
                      // Extract domain name from full origin
                      const getDomainName = (origin: string) => {
                        try {
                          const url = new URL(origin);
                          return url.hostname;
                        } catch {
                          return origin;
                        }
                      };
                      const domainName = getDomainName(site.domain);

                      return (
                        <div
                          key={site.id}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                              <Globe className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">
                                {domainName}
                              </p>
                              <p className="text-gray-500 text-[10px] truncate">
                                {site.domain}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDisconnectSite(site.domain)}
                            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            Disconnect
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Address Copy Popup (Phantom style) */}
      <AnimatePresence>
        {showCopyPopup && (
          <>
            <div
              className="fixed inset-0 z-[50] bg-transparent"
              onClick={() => setShowCopyPopup(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              transition={{ duration: 0.15 }}
              className="absolute top-14 left-3 w-64 bg-gray-900 border border-white/10 rounded-md shadow-2xl z-[60] p-1 overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg transition-colors group cursor-pointer"
                onClick={() => {
                  handleCopy();
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-black flex items-center justify-center border border-white/10">
                    <img
                      src="/solana.svg"
                      alt="Solana"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Solana</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {activeWallet?.address || ""}
                  </span>
                  {copied ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-gray-500 group-hover:text-white" />
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Connection Approval Modal */}
      {pendingConnection && activeWallet && (
        <ConnectionApproval
          request={pendingConnection}
          walletAddress={activeWallet.fullAddress}
          onApprove={handleApproveConnection}
          onReject={handleRejectConnection}
        />
      )}

      {/* Sign Approval Modal */}
      {pendingSignRequest && activeWallet && (
        <SignApproval
          request={pendingSignRequest}
          walletAddress={activeWallet.fullAddress}
          onApprove={handleApproveSign}
          onReject={handleRejectSign}
        />
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onDeposit={handleDeposit}
        availableBalance={activeWallet?.balance || 0}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onWithdraw={handleWithdraw}
        privateBalance={privateBalance}
        defaultRecipient={activeWallet?.fullAddress}
      />

      {/* Send Privately Modal (Combined Deposit + Withdraw) */}
      <SendPrivatelyModal
        isOpen={showSendPrivatelyModal}
        onClose={() => setShowSendPrivatelyModal(false)}
        onSendPrivately={handleSendPrivately}
        availableBalance={activeWallet?.balance || 0}
        defaultRecipient={activeWallet?.fullAddress}
      />

      {/* Transfer Modal */}
      {activeWallet && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransfer}
          availableBalance={activeWallet.balance}
          fromAddress={activeWallet.fullAddress}
          network={activeNetwork}
        />
      )}

      {/* Coming Soon Modal */}
      <ComingSoonModal
        isOpen={showComingSoonModal}
        onClose={() => setShowComingSoonModal(false)}
        feature={comingSoonFeature}
      />
    </div>
  );
};

export default Home;
