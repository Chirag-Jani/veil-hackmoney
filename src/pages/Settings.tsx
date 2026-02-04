import bs58 from "bs58";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Key,
  Lock,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getEthereumWalletForIndex,
  getKeypairForIndex,
} from "../utils/keyManager";
import { getPrivacyCashMode, setPrivacyCashMode } from "../utils/settings";
import type { BurnerWallet } from "../utils/storage";
import {
  getAllBurnerWallets,
  getArchivedBurnerWallets,
} from "../utils/storage";
import { lockWallet } from "../utils/walletLock";

const Settings = () => {
  const navigate = useNavigate();
  const [showExportModal, setShowExportModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeWallet, setActiveWallet] = useState<BurnerWallet | null>(null);
  const [archivedWallets, setArchivedWallets] = useState<BurnerWallet[]>([]);
  const [selectedWalletForExport, setSelectedWalletForExport] =
    useState<BurnerWallet | null>(null);
  const [privacyCashMode, setPrivacyCashModeState] = useState<boolean>(true);

  // Load active wallet, archived wallets count, and settings on mount
  useEffect(() => {
    const loadData = async () => {
      const wallets = await getAllBurnerWallets();
      const active = wallets.find((w) => w.isActive) || wallets[0] || null;
      setActiveWallet(active);

      const archived = await getArchivedBurnerWallets();
      setArchivedWallets(archived);

      const privacyCashEnabled = await getPrivacyCashMode();
      setPrivacyCashModeState(privacyCashEnabled);
    };
    loadData();
  }, []);

  const handleTogglePrivacyCashMode = async () => {
    const newValue = !privacyCashMode;
    await setPrivacyCashMode(newValue);
    setPrivacyCashModeState(newValue);
  };

  const handleLockWallet = async () => {
    try {
      await lockWallet();
      navigate("/home");
    } catch (error) {
      console.error("[Veil] Error locking wallet:", error);
    }
  };

  const handleExportPrivateKey = async (wallet?: BurnerWallet) => {
    const targetWallet = wallet || activeWallet;

    if (!password) {
      setPasswordError("Please enter your password");
      return;
    }

    setIsVerifying(true);
    setPasswordError("");

    try {
      if (!targetWallet) {
        setPasswordError("No wallet found");
        setPassword("");
        return;
      }

      if (targetWallet.network === "ethereum") {
        const { address, privateKey: ethPrivateKey } =
          await getEthereumWalletForIndex(password, targetWallet.index);
        if (address.toLowerCase() !== targetWallet.fullAddress.toLowerCase()) {
          console.error("[Veil] Ethereum address mismatch:", {
            derived: address,
            stored: targetWallet.fullAddress,
            index: targetWallet.index,
          });
          setPasswordError("Key derivation mismatch. Please try again.");
          setPassword("");
          return;
        }
        setPrivateKey(ethPrivateKey);
      } else {
        const walletKeypair = await getKeypairForIndex(
          password,
          targetWallet.index
        );
        const derivedPublicKey = walletKeypair.publicKey.toBase58();
        if (derivedPublicKey !== targetWallet.fullAddress) {
          console.error("[Veil] Public key mismatch:", {
            derived: derivedPublicKey,
            stored: targetWallet.fullAddress,
            index: targetWallet.index,
          });
          setPasswordError("Key derivation mismatch. Please try again.");
          setPassword("");
          return;
        }
        const secretKeyBytes = new Uint8Array(walletKeypair.secretKey);
        setPrivateKey(bs58.encode(secretKeyBytes));
      }
      setPassword("");
    } catch {
      setPasswordError("Incorrect password. Please try again.");
      setPassword("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyPrivateKey = () => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseModal = () => {
    setShowExportModal(false);
    setSelectedWalletForExport(null);
    setPassword("");
    setPasswordError("");
    setPrivateKey(null);
    setCopied(false);
  };

  return (
    <div className="h-full w-full bg-black text-white relative flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="text-lg font-bold">Settings</h1>
      </div>

      {/* Settings Options */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          {/* Private Transfers Toggle */}
          <div className="w-full p-4 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Key className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Private Transfers</p>
                  <p className="text-xs text-gray-500">
                    {privacyCashMode
                      ? "Unlinkable transfers enabled"
                      : "Normal wallet mode"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleTogglePrivacyCashMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacyCashMode ? "bg-blue-600" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacyCashMode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Export Private Key */}
          <button
            onClick={() => {
              setSelectedWalletForExport(null); // Clear any selected archived wallet
              setShowExportModal(true);
            }}
            className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Key className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Export Private Key</p>
                <p className="text-xs text-gray-500">
                  Reveal your active wallet private key
                </p>
              </div>
            </div>
            <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </div>
          </button>

          {/* Lock Wallet */}
          <button
            onClick={handleLockWallet}
            className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Lock className="w-5 h-5 text-red-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Lock Wallet</p>
                <p className="text-xs text-gray-500">
                  Lock your wallet and require password to unlock
                </p>
              </div>
            </div>
            <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </div>
          </button>

          {/* Archived Wallets */}
          <button
            onClick={() => navigate("/archived")}
            className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-500/20 rounded-lg">
                <Archive className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Archived Wallets</p>
                <p className="text-xs text-gray-500">
                  {archivedWallets.length}{" "}
                  {archivedWallets.length === 1 ? "wallet" : "wallets"} archived
                </p>
              </div>
            </div>
            <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </div>
          </button>
        </div>
      </div>

      {/* Export Private Key Modal */}
      <AnimatePresence>
        {showExportModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-gray-900 rounded-t-2xl z-50 border-t border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              <div className="px-4 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">
                    Export Private Key
                    {selectedWalletForExport && (
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        ({selectedWalletForExport.site})
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={handleCloseModal}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {!privateKey ? (
                  <>
                    {/* Warning */}
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-400 mb-1">
                            Security Warning
                          </p>
                          <p className="text-xs text-red-300/80 leading-relaxed">
                            Never share your private key with anyone. Anyone
                            with access to your private key can control your
                            wallet and steal your funds.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Enter your password to continue
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isVerifying) {
                            handleExportPrivateKey();
                          }
                        }}
                        placeholder="Enter password"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
                        autoFocus
                      />
                      {passwordError && (
                        <p className="text-xs text-red-400 mt-2">
                          {passwordError}
                        </p>
                      )}
                    </div>

                    {/* Verify Button */}
                    <button
                      onClick={() =>
                        handleExportPrivateKey(
                          selectedWalletForExport || undefined
                        )
                      }
                      disabled={!password || isVerifying}
                      className={`w-full py-3.5 px-4 font-semibold rounded-xl transition-all ${
                        password && !isVerifying
                          ? "bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/20"
                          : "bg-white/10 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      {isVerifying ? "Verifying..." : "Continue"}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Private Key Display */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Your Private Key
                      </label>
                      <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                        <p className="text-sm font-mono break-all text-white">
                          {privateKey}
                        </p>
                      </div>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={handleCopyPrivateKey}
                      className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center gap-2 transition-all mb-3"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-green-400" />
                          <span className="text-sm font-medium text-green-400">
                            Copied!
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium">
                            Copy Private Key
                          </span>
                        </>
                      )}
                    </button>

                    {/* Close Button */}
                    <button
                      onClick={handleCloseModal}
                      className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
