import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getStaticRoute, StaticPage } from './components/StaticPages';
import './index.css';

sessionStorage.removeItem('inkmaster:asset-reload-attempted');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const staticRoute = getStaticRoute(window.location.pathname);
root.render(
  <React.StrictMode>
    {staticRoute ? <StaticPage route={staticRoute} /> : <App />}
  </React.StrictMode>
);
