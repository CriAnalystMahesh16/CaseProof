import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './studio.css';
import App from './LiveApp.jsx';
import { SessionProvider } from './state/resources.jsx';

createRoot(document.getElementById('root')).render(
  <SessionProvider>
      <App />
  </SessionProvider>,
);
import "./quality.css";
