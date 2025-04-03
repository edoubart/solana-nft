// NPM Packages
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Custom Modules
import App from './components/App';

// Styles
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
