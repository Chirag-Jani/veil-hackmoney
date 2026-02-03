import { motion } from "framer-motion";
import { Check, Globe, Shield, X } from "lucide-react";
import type { PendingConnectionRequest } from "../utils/storage";

interface ConnectionApprovalProps {
  request: PendingConnectionRequest;
  walletAddress: string;
  onApprove: () => void;
  onReject: () => void;
}

const ConnectionApproval = ({
  request,
  walletAddress,
  onApprove,
  onReject,
}: ConnectionApprovalProps) => {
  // Extract domain name from origin
  const getDomainName = (origin: string) => {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      return origin;
    }
  };

  const domain = getDomainName(request.origin);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-b from-gray-900 to-gray-950 border-t border-white/10 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header - Compact */}
        <div className="px-4 pt-3 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shrink-0">
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                Connection Request
              </h2>
              <p className="text-[10px] text-gray-400 truncate">{domain}</p>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Site Info - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">
                  {domain}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {request.origin}
                </p>
              </div>
            </div>
          </div>

          {/* Wallet Info - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400">Connecting with</p>
                <p className="text-xs text-white font-mono truncate">
                  {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Notice - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="text-[10px] text-gray-500 space-y-1">
              <p className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-green-400 shrink-0" />
                View your wallet address
              </p>
              <p className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-green-400 shrink-0" />
                Request transaction signatures
              </p>
              <p className="flex items-center gap-1.5 mt-1.5 text-blue-400/90">
                <Shield className="w-3 h-3 shrink-0" />
                This site sees a unique address—your main wallet stays hidden
              </p>
            </div>
          </div>
        </div>

        {/* Actions - Compact */}
        <div className="p-3 bg-black/20 border-t border-white/5 flex gap-2">
          <button
            onClick={onReject}
            className="flex-1 py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            onClick={onApprove}
            className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20"
          >
            <Check className="w-3.5 h-3.5" />
            Connect
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ConnectionApproval;
