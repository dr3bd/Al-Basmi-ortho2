import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ClinicalStorageProvider } from './storage/context/ClinicalStorageContext.tsx';
import './index.css';

// Register the offline application shell in production builds (HTTPS required).
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Al-Basmi Orth offline support could not be registered:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClinicalStorageProvider>
      <App />
    </ClinicalStorageProvider>
  </StrictMode>
);
