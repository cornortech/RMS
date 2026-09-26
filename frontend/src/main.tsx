import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';
import CustomerMenu from './components/CustomerMenu';

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(API_ROOT)) return originalFetch(input, init);

  const token = localStorage.getItem('authToken');
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const res = await originalFetch(input, { ...init, headers });
  const isLoginCall = /\/(auth\/login|auth\/verify|staff\/login)$/.test(new URL(url).pathname);
  if (token && res.status === 401 && !isLoginCall) {
    localStorage.removeItem('authToken');
    window.location.reload();
  }
  return res;
};

const isCustomerPage = window.location.pathname.startsWith('/scan/');

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