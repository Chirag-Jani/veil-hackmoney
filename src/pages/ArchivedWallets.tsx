import bs58 from "bs58";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Key,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getEthereumWalletForIndex,
  getKeypairForIndex,
} from "../utils/keyManager";
import { getArchivedBurnerWallets, type BurnerWallet } from "../utils/storage";

const ArchivedWallets = () => {
  const navigate = useNavigate();
  const [archivedWallets, setArchivedWallets] = useState<BurnerWallet[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<BurnerWallet | null>(
    null
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadArchivedWallets = async () => {
      const archived = await getArchivedBurnerWallets();
      setArchivedWallets(archived);
    };
    loadArchivedWallets();
  }, []);

  const handleExportPrivateKey = async () => {
    if (!password) {
      setPasswordError("Please enter your password");
      return;
    }

    if (!selectedWallet) {
      setPasswordError("No wallet selected");
      return;
    }

    setIsVerifying(true);
    setPasswordError("");

    try {
      if (
          selectedWallet.network === "ethereum" ||
          selectedWallet.network === "avalanche" ||
          selectedWallet.network === "arbitrum"
        ) {
          const { address, privateKey: ethPrivateKey } =
            await getEthereumWalletForIndex(password, selectedWallet.index);
        if (
          address.toLowerCase() !== selectedWallet.fullAddress.toLowerCase()
        ) {
          console.error("[Veil] Ethereum address mismatch:", {
            derived: address,
            stored: selectedWallet.fullAddress,
            index: selectedWallet.index,
          });
          setPasswordError("Key derivation mismatch. Please try again.");
          setPassword("");
          return;
        }
        setPrivateKey(ethPrivateKey);
        } else {
          const walletKeypair = await getKeypairForIndex(
            password,
            selectedWallet.index
          );
          const derivedPublicKey = walletKeypair.publicKey.toBase58();
          if (derivedPublicKey !== selectedWallet.fullAddress) {
            console.error("[Veil] Public key mismatch:", {
              derived: derivedPublicKey,
              stored: selectedWallet.fullAddress,
              index: selectedWallet.index,
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
    setSelectedWallet(null);
    setPassword("");
    setPasswordError("");
    setPrivateKey(null);
    setCopied(false);
  };

  const handleExportWallet = (wallet: BurnerWallet) => {
    setSelectedWallet(wallet);
    setShowExportModal(true);
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
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-gray-400" />
          <h1 className="text-lg font-bold">Archived Wallets</h1>
        </div>
      </div>

      {/* Archived Wallets List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {archivedWallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Archive className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-gray-400 text-sm mb-1">No archived wallets</p>
            <p className="text-gray-600 text-xs">
              Archived wallets will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {archivedWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white">
                        {wallet.site}
                      </p>
                      <span className="px-2 py-0.5 text-[10px] bg-gray-500/20 text-gray-400 rounded-full font-medium">
                        ARCHIVED
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-1">
                      {wallet.address}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {wallet.balance.toFixed(3)} SOL
                    </p>
                    <p className="text-xs text-gray-500">
                      ≈ ${(wallet.balance * 145).toFixed(2)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleExportWallet(wallet)}
                  className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg flex items-center justify-center gap-2 transition-all text-xs font-medium"
                >
                  <Key className="w-4 h-4 text-gray-400" />
                  <span>Export Private Key</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export Private Key Modal */}
      <AnimatePresence>
        {showExportModal && selectedWallet && (
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
                  <div>
                    <h2 className="text-lg font-bold">Export Private Key</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedWallet.site}
                    </p>
                  </div>
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
                      onClick={handleExportPrivateKey}
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

export default ArchivedWallets;
