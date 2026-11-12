import '@/styles/globals.css';
import { useEffect } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { installErrorLogger } from '@/lib/errorLogger';
import InstallBanner from '@/components/InstallBanner'; // ZENORIA_INSTALL_BANNER_V1

export default function App({ Component, pageProps }) {
  // Journal des erreurs rencontrées par les visiteurs (voir lib/errorLogger.js)
  useEffect(() => installErrorLogger(), []);

  return (
    <ErrorBoundary>
      <Component {...pageProps} />
      <InstallBanner /> {/* ZENORIA_INSTALL_BANNER_V1 : une seule fois ici, sur toutes les pages */}
    </ErrorBoundary>
  );
}
