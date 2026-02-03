import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import ArchivedWallets from './pages/ArchivedWallets';
import History from './pages/History';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import { hasWallet } from './utils/keyManager';

const App = () => {
  const [hasSeed, setHasSeed] = useState<boolean | null>(null); // null = loading, true/false = loaded

  useEffect(() => {
    const checkWallet = async () => {
      try {
        const walletExists = await hasWallet();
        setHasSeed(walletExists);
      } catch (error) {
        console.error('[Veil] Error checking wallet:', error);
        setHasSeed(false);
      }
    };

    checkWallet();
  }, []);

  // Show loading state while checking wallet
  if (hasSeed === null) {
    return (
      <div className="w-[360px] h-[600px] bg-background text-foreground overflow-hidden font-sans select-none flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="w-[360px] h-[600px] bg-background text-foreground overflow-hidden font-sans select-none">
        <Routes>
          <Route path="/" element={hasSeed ? <Navigate to="/home" /> : <Navigate to="/onboarding" />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="/archived" element={<ArchivedWallets />} />
        </Routes>
      </div>
    </HashRouter>
  );
};

export default App;
