import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';
import CustomerMenu from './components/CustomerMenu';
import OnlineOrder from './components/delivery/OnlineOrder';
import TrackOrder from './components/delivery/TrackOrder';
import RiderApp from './components/delivery/RiderApp';
import { installOfflineFetch } from './offline/offlineFetch';

// If the address starts with /scan/ a customer scanned a table QR → show the public menu page.
const path = window.location.pathname;
const isCustomerPage = path.startsWith('/scan/');
const isOnlineOrder = path.startsWith('/order/');
const isTrackPage = path.startsWith('/track/');
const isRiderPage = path.startsWith('/rider/');
const isPublicPage = isCustomerPage || isOnlineOrder || isTrackPage || isRiderPage;

// Staff app only: adds the login token to API calls + offline support
// (replaces the old window.fetch code that was here before).
if (!isPublicPage) installOfflineFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCustomerPage ? (
     <CustomerMenu />
    ) : isOnlineOrder ? (
     <OnlineOrder />
    ) : isTrackPage ? (
     <TrackOrder />
    ) : isRiderPage ? (
     <RiderApp />
    ) : (
     <LanguageProvider>
      <App />
     </LanguageProvider>
    )}
  </StrictMode>,
);