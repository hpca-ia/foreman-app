import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme/tokens.css';
import App from './App';
import { instalarSesionEnApi } from './lib/sesion';

// Antes de cualquier llamada: NOVA y el correo solo responden con sesión.
instalarSesionEnApi();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
