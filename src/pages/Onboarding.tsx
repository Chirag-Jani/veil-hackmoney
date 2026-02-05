import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deriveKeypairFromSeed,
  ethPrivateKeyToSeed,
  generateMnemonic,
  getPrivateKeyFormat,
  mnemonicToSeed,
  privateKeyToKeypair,
  privateKeyToSeed,
  setImportTypeSeed,
  storeEncryptedSeed,
  storeImportedEthereumPrivateKey,
  storeImportedPrivateKey,
  validateMnemonic,
  validatePrivateKey,
} from "../utils/keyManager";
import { Wallet } from "ethers";
import { setActiveBurnerIndex } from "../utils/settings";
import {
  formatAddress,
  getAddressFromKeypair,
  storeBurnerWallet,
  type BurnerWallet,
} from "../utils/storage";
import { unlockWallet } from "../utils/walletLock";

type OnboardingStep = "welcome" | "create" | "restore" | "password";
type RestoreType = "seedPhrase" | "privateKey";

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [copied, setCopied] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreType, setRestoreType] = useState<RestoreType>("seedPhrase");
  const [privateKeyInput, setPrivateKeyInput] = useState("");

  // Generate mnemonic when entering create step
  useEffect(() => {
    if (step === "create" && !mnemonic) {
      const newMnemonic = generateMnemonic();
      setMnemonic(newMnemonic);
    }
  }, [step, mnemonic]);

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateWallet = async () => {
    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setIsCreating(true);
    try {
      const seed = await mnemonicToSeed(mnemonic);
      await storeEncryptedSeed(seed, password);
      await setImportTypeSeed(); // Mark as seed-based wallet
      await unlockWallet();

      // Store password temporarily in sessionStorage for first burner generation
      // This will be cleared after first burner is created
      sessionStorage.setItem("veil:temp_password", password);

      navigate("/home");
    } catch (error) {
      console.error("[Veil] ❌ Error creating wallet:", error);
      setPasswordError("Failed to create wallet. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async () => {
    if (restoreType === "seedPhrase") {
      const words = restoreInput.trim().split(/\s+/);
      if (words.length !== 12) {
        setRestoreError("Please enter exactly 12 words");
        return;
      }

      const mnemonicPhrase = words.join(" ");
      if (!validateMnemonic(mnemonicPhrase)) {
        setRestoreError("Invalid seed phrase. Please check your words.");
        return;
      }

      setMnemonic(mnemonicPhrase);
      setStep("password");
      setRestoreError("");
    } else {
      // Private key restore
      if (!privateKeyInput.trim()) {
        setRestoreError("Please enter your private key");
        return;
      }

      if (!validatePrivateKey(privateKeyInput)) {
        setRestoreError(
          "Invalid private key. Use Solana (base58 or byte array) or Ethereum (64 hex chars, optional 0x)."
        );
        return;
      }

      setStep("password");
      setRestoreError("");
    }
  };

  const handleRestoreWallet = async () => {
    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setIsRestoring(true);
    try {
      let seed: Uint8Array;

      if (restoreType === "seedPhrase") {
        seed = await mnemonicToSeed(mnemonic);
        await storeEncryptedSeed(seed, password);
        await setImportTypeSeed(); // Mark as seed-based wallet
      } else {
        const keyFormat = getPrivateKeyFormat(privateKeyInput);

        if (keyFormat === "ethereum") {
          seed = ethPrivateKeyToSeed(privateKeyInput);
          await storeEncryptedSeed(seed, password);
          await storeImportedEthereumPrivateKey(privateKeyInput, password);

          const ethWallet = new Wallet(
            privateKeyInput.trim().startsWith("0x")
              ? privateKeyInput.trim()
              : `0x${privateKeyInput.trim()}`
          );
          const ethBurner: BurnerWallet = {
            id: Date.now(),
            address: formatAddress(ethWallet.address),
            fullAddress: ethWallet.address,
            balance: 0,
            site: "Imported Wallet",
            isActive: true,
            index: 0,
            network: "ethereum",
          };
          await storeBurnerWallet(ethBurner);
          await setActiveBurnerIndex("ethereum", 0);

          const solKeypair = deriveKeypairFromSeed(seed, 0);
          const solAddress = getAddressFromKeypair(solKeypair);
          const solBurner: BurnerWallet = {
            id: Date.now() + 1,
            address: formatAddress(solAddress),
            fullAddress: solAddress,
            balance: 0,
            site: "Imported Wallet",
            isActive: true,
            index: 0,
            network: "solana",
          };
          await storeBurnerWallet(solBurner);
          await setActiveBurnerIndex("solana", 0);
        } else {
          seed = privateKeyToSeed(privateKeyInput);
          await storeEncryptedSeed(seed, password);
          await storeImportedPrivateKey(privateKeyInput, password);

          const importedKeypair = privateKeyToKeypair(privateKeyInput);
          const address = getAddressFromKeypair(importedKeypair);
          const importedWallet: BurnerWallet = {
            id: Date.now(),
            address: formatAddress(address),
            fullAddress: address,
            balance: 0,
            site: "Imported Wallet",
            isActive: true,
            index: 0,
            network: "solana",
          };
          await storeBurnerWallet(importedWallet);
          await setActiveBurnerIndex("solana", 0);
        }
      }

      await unlockWallet();

      // Store password temporarily for first burner generation (or for imported wallet balance check)
      sessionStorage.setItem("veil:temp_password", password);

      navigate("/home");
    } catch (error) {
      console.error("[Veil] ❌ Error restoring wallet:", error);
      setPasswordError("Failed to restore wallet. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  };

  const slideVariants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 },
  };

  return (
    <div className="h-full w-full bg-gradient-to-br from-black via-gray-900 to-slate-900 p-6 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-20%] w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />

      <AnimatePresence mode="wait">
        {/* Welcome Step */}
        {step === "welcome" && (
          <motion.div
            key="welcome"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="z-10 w-full max-w-xs space-y-8"
          >
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-xl backdrop-blur-md overflow-hidden p-3">
                <img
                  src="/veil_shield.png"
                  alt="Veil Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                  Veil
                </h1>
                <p className="text-gray-400 mt-3 text-sm leading-relaxed">
                  Privacy by default. Own your on-chain identity.
                </p>
                <p className="text-gray-600 mt-2 text-xs">
                  Privacy by default. Multi-chain wallet for Ethereum and
                  Solana. Private transfers and burner wallets so your
                  on-chain identity stays unlinkable.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setStep("create")}
                  className="group w-full py-3.5 px-4 bg-white text-black font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Create New Wallet
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => setStep("restore")}
                  className="w-full py-3.5 px-4 bg-white/5 text-white font-medium rounded-xl border border-white/10 hover:bg-white/10 transition-all"
                >
                  Restore Existing Wallet
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Create Wallet Step */}
        {step === "create" && (
          <motion.div
            key="create"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="z-10 w-full max-w-xs space-y-6"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Secure Your Seed</h2>
              <p className="text-gray-400 text-sm mt-2">
                Write these 12 words down. This is the{" "}
                <span className="text-red-400 font-semibold">ONLY</span> way to
                recover your funds.
              </p>
            </div>

            <div className="relative">
              <div
                className={`grid grid-cols-3 gap-2 transition-all ${
                  !showSeed ? "blur-md" : ""
                }`}
              >
                {mnemonic.split(" ").map((word, i) => (
                  <div
                    key={i}
                    className="bg-white/5 border border-white/10 rounded-lg p-2 text-center text-xs text-gray-300 font-mono"
                  >
                    <span className="text-gray-600 mr-1.5 select-none">
                      {i + 1}
                    </span>
                    {word}
                  </div>
                ))}
              </div>

              {!showSeed && (
                <button
                  onClick={() => setShowSeed(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl"
                >
                  <div className="flex items-center gap-2 text-white bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                    <Eye className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      Reveal Seed Phrase
                    </span>
                  </div>
                </button>
              )}
            </div>

            {showSeed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <button
                  onClick={handleCopy}
                  className="w-full py-2 px-3 bg-white/5 text-gray-300 text-sm font-medium rounded-lg border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? "Copied to clipboard" : "Copy to clipboard"}
                </button>

                <button
                  onClick={() => setShowSeed(false)}
                  className="w-full py-2 px-3 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 hover:text-gray-300 transition-colors"
                >
                  <EyeOff className="w-4 h-4" />
                  Hide Seed Phrase
                </button>

                <button
                  onClick={() => setStep("password")}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20"
                >
                  I Saved It Securely
                </button>
              </motion.div>
            )}

            <button
              onClick={() => setStep("welcome")}
              className="w-full text-center text-gray-600 text-sm hover:text-gray-400 transition-colors"
            >
              ← Back
            </button>
          </motion.div>
        )}

        {/* Restore Wallet Step */}
        {step === "restore" && (
          <motion.div
            key="restore"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="z-10 w-full max-w-xs space-y-6"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Restore Wallet</h2>
              <p className="text-gray-400 text-sm mt-2">
                Import using your seed phrase or private key.
              </p>
            </div>

            {/* Restore Type Tabs */}
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => {
                  setRestoreType("seedPhrase");
                  setRestoreError("");
                }}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all ${
                  restoreType === "seedPhrase"
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Seed Phrase
              </button>
              <button
                onClick={() => {
                  setRestoreType("privateKey");
                  setRestoreError("");
                }}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all ${
                  restoreType === "privateKey"
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Private Key
              </button>
            </div>

            <div>
              {restoreType === "seedPhrase" ? (
                <textarea
                  value={restoreInput}
                  onChange={(e) => {
                    setRestoreInput(e.target.value);
                    setRestoreError("");
                  }}
                  placeholder="Enter your 12-word seed phrase..."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              ) : (
                <textarea
                  value={privateKeyInput}
                  onChange={(e) => {
                    setPrivateKeyInput(e.target.value);
                    setRestoreError("");
                  }}
                  placeholder="Enter private key (Solana: base58/byte array; ETH: 64 hex chars)"
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              )}
              {restoreError && (
                <p className="text-red-400 text-xs mt-2">{restoreError}</p>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={handleRestore}
                disabled={
                  restoreType === "seedPhrase"
                    ? !restoreInput.trim()
                    : !privateKeyInput.trim()
                }
                className={`w-full py-3.5 px-4 font-semibold rounded-xl transition-all ${
                  (
                    restoreType === "seedPhrase"
                      ? restoreInput.trim()
                      : privateKeyInput.trim()
                  )
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/20"
                    : "bg-white/10 text-gray-500 cursor-not-allowed"
                }`}
              >
                Restore Wallet
              </button>

              <button
                onClick={() => setStep("welcome")}
                className="w-full text-center text-gray-600 text-sm hover:text-gray-400 transition-colors"
              >
                ← Back
              </button>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <p className="text-xs text-yellow-500/80 text-center">
                {restoreType === "seedPhrase"
                  ? "⚠️ Never share your seed phrase. Veil will never ask for it."
                  : "⚠️ Never share your private key. Keep it secure."}
              </p>
            </div>
          </motion.div>
        )}

        {/* Password Step (for both create and restore) */}
        {step === "password" && (
          <motion.div
            key="password"
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="z-10 w-full max-w-xs space-y-6"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Set Password</h2>
              <p className="text-gray-400 text-sm mt-2">
                Create a password to encrypt your wallet. You'll need this to
                unlock your wallet.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Enter password (min 8 characters)"
                  className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Confirm password"
                  className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              {passwordError && (
                <p className="text-red-400 text-xs">{passwordError}</p>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  // If we have mnemonic from create flow (not restore), use create flow
                  // Otherwise it's a restore flow (seed phrase or private key)
                  const isCreateFlow =
                    mnemonic && !restoreInput && !privateKeyInput;
                  if (isCreateFlow) {
                    handleCreateWallet();
                  } else {
                    handleRestoreWallet();
                  }
                }}
                disabled={
                  isCreating || isRestoring || !password || !confirmPassword
                }
                className={`w-full py-3.5 px-4 font-semibold rounded-xl transition-all ${
                  password && confirmPassword && !isCreating && !isRestoring
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/20"
                    : "bg-white/10 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isCreating || isRestoring ? "Processing..." : "Continue"}
              </button>

              <button
                onClick={() => {
                  // Go back to restore if we came from there (either seed phrase or private key)
                  const isRestoreFlow =
                    (restoreType === "seedPhrase" && restoreInput) ||
                    (restoreType === "privateKey" && privateKeyInput);
                  setStep(isRestoreFlow ? "restore" : "create");
                  setPassword("");
                  setConfirmPassword("");
                  setPasswordError("");
                }}
                className="w-full text-center text-gray-600 text-sm hover:text-gray-400 transition-colors"
              >
                ← Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
