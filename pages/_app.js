import '@/styles/globals.css';
import { useEffect } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { installErrorLogger } from '@/lib/errorLogger';

export default function App({ Component, pageProps }) {
  // Journal des erreurs rencontrées par les visiteurs (voir lib/errorLogger.js)
  useEffect(() => installErrorLogger(), []);

  return (
    <ErrorBoundary>
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}
