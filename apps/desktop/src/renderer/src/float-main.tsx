import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatApp } from './FloatApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FloatApp />
  </StrictMode>,
);
