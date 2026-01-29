import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Это единственный раз, когда мы вызываем createRoot
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);