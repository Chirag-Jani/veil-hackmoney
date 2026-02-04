import { motion } from "framer-motion";
import { MessageSquare, Check, X, Shield, AlertTriangle } from "lucide-react";
import type { PendingSignRequest } from "../utils/storage";

interface SignApprovalProps {
  request: PendingSignRequest;
  walletAddress: string;
  onApprove: () => void;
  onReject: () => void;
}

const SignApproval = ({
  request,
  walletAddress,
  onApprove,
  onReject,
}: SignApprovalProps) => {
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

  // Format message for display
  const getMessagePreview = () => {
    if (request.data.message) {
      try {
        const decoder = new TextDecoder();
        const text = decoder.decode(new Uint8Array(request.data.message));
        // Show first 50 chars
        return text.length > 50 ? text.slice(0, 50) + '...' : text;
      } catch {
        return `${request.data.message.length} bytes`;
      }
    }
    return 'Message data';
  };

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
              <MessageSquare className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                Sign Message
              </h2>
              <p className="text-[10px] text-gray-400 truncate">
                {domain}
              </p>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Site Info - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{domain}</p>
                <p className="text-[10px] text-gray-500 truncate">{request.origin}</p>
              </div>
            </div>
          </div>

          {/* Request Details - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 mb-0.5">
                  Message
                </p>
                <p className="text-xs text-white font-mono break-all">
                  {getMessagePreview()}
                </p>
                {request.data.display && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Format: {request.data.display}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Wallet Info - Compact */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400">Signing with</p>
                <p className="text-xs text-white font-mono truncate">
                  {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                </p>
              </div>
            </div>
          </div>

          {/* Warning - Compact */}
          <div className="flex items-start gap-1.5 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Only sign messages from sites you trust. Signing does not grant access to your funds.
            </p>
          </div>
        </div>

        {/* Actions - Compact */}
        <div className="p-3 bg-black/20 border-t border-white/5 flex gap-2">
          <button
            onClick={onReject}
            className="flex-1 py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            onClick={onApprove}
            className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-orange-500/20"
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SignApproval;
