import { Shield, TrendingUp } from "lucide-react";

interface PrivacyScoreDisplayProps {
  privateBalance: number;
  burnerCount: number;
  totalTransactions?: number;
}

const PrivacyScoreDisplay = ({
  privateBalance,
  burnerCount,
}: PrivacyScoreDisplayProps) => {
  // Calculate privacy score (0-100)
  // Factors:
  // - Private balance: 40 points max (1 point per 0.1 SOL, capped at 4 SOL = 40 points)
  // - Burner count: 30 points max (1 point per burner, capped at 30 burners)
  // - Base score: 30 points (for using the wallet)
  
  const privateBalanceScore = Math.min(40, (privateBalance / 0.1) * 1);
  const burnerScore = Math.min(30, burnerCount * 1);
  const baseScore = 30;
  
  const privacyScore = Math.min(100, Math.round(privateBalanceScore + burnerScore + baseScore));

  // Determine privacy level
  const getPrivacyLevel = (score: number) => {
    if (score >= 80) return { level: "Excellent", color: "text-green-400", bg: "bg-green-500/20", border: "border-green-500/30" };
    if (score >= 60) return { level: "Good", color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30" };
    if (score >= 40) return { level: "Fair", color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/30" };
    return { level: "Basic", color: "text-gray-400", bg: "bg-gray-500/20", border: "border-gray-500/30" };
  };

  const privacyLevel = getPrivacyLevel(privacyScore);

  return (
    <div className={`p-4 rounded-xl border ${privacyLevel.bg} ${privacyLevel.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className={`w-4 h-4 ${privacyLevel.color}`} />
          <span className="text-xs font-medium text-gray-400">Privacy Score</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className={`w-3 h-3 ${privacyLevel.color}`} />
          <span className={`text-sm font-bold ${privacyLevel.color}`}>
            {privacyScore}/100
          </span>
        </div>
      </div>

      {/* Score Bar */}
      <div className="mb-3">
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full ${privacyLevel.bg.replace("/20", "")} transition-all duration-500`}
            style={{ width: `${privacyScore}%` }}
          />
        </div>
      </div>

      {/* Privacy Level */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${privacyLevel.color}`}>
          {privacyLevel.level}
        </span>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>{burnerCount} burners</span>
          {privateBalance > 0 && (
            <>
              <span>•</span>
              <span>{privateBalance.toFixed(3)} private</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacyScoreDisplay;
