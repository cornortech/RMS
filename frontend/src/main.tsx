import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';
import CustomerMenu from './components/CustomerMenu';
import { installOfflineFetch } from './offline/offlineFetch';

// If the address starts with /scan/ a customer scanned a table QR → show the public menu page.
const isCustomerPage = window.location.pathname.startsWith('/scan/');

// Staff app only: adds the login token to API calls + offline support
// (replaces the old window.fetch code that was here before).
if (!isCustomerPage) installOfflineFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCustomerPage ? (
      <CustomerMenu />
    ) : (
      <LanguageProvider>
        <App />
      </LanguageProvider>
    )}
  </StrictMode>,
);