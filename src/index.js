// NPM Packages
import React from 'react';
import ReactDOM from 'react-dom/client';

// Custom Modules
import App from './components/App';

// Styles
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
