import { useState } from "react";
import { getDecryptedSeed } from "../utils/keyManager";
import { unlockWallet } from "../utils/walletLock";

interface UnlockWalletProps {
  onUnlock: (password: string) => void;
}

const UnlockWallet = ({ onUnlock }: UnlockWalletProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setIsUnlocking(true);
    setError("");

    try {
      // Add a small delay to show loading state and make unlock feel more deliberate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Try to decrypt the seed to verify password
      await getDecryptedSeed(password);
      await unlockWallet();
      onUnlock(password);
    } catch (err) {
      console.error("[Veil] Unlock error:", err);
      setError("Incorrect password. Please try again.");
      setIsUnlocking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUnlock();
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-br from-black via-gray-900 to-slate-900 p-6 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-20%] w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-64 h-64 bg-purple-500/20 rounded-full blur-[100px]" />

      <div className="z-10 w-full max-w-xs space-y-6">
        <div className="text-center space-y-4">
          <div className="mx-auto w-32 h-32 flex items-center justify-center overflow-hidden p-3">
            <img
              src="/veil_shield.png"
              alt="Veil Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-gray-400 mt-2 text-sm">
              Enter your password to access your wallet
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter password"
              className="w-full py-3.5 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          <button
            onClick={handleUnlock}
            disabled={isUnlocking || !password}
            className={`w-full py-3.5 px-4 font-semibold rounded-xl transition-all ${
              password && !isUnlocking
                ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/20"
                : "bg-white/10 text-gray-500 cursor-not-allowed"
            }`}
          >
            {isUnlocking ? "Unlocking..." : "Unlock Wallet"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnlockWallet;
