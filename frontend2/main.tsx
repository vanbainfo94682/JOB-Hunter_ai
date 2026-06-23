import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminDashboard from './App';
import './global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AdminDashboard />
  </React.StrictMode>
);
