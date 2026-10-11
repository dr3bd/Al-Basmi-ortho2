import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ClinicalStorageProvider } from './storage/context/ClinicalStorageContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClinicalStorageProvider>
      <App />
    </ClinicalStorageProvider>
  </StrictMode>
);
