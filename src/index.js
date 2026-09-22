import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme/tokens.css';
import App from './App';
import { instalarSesionEnApi } from './lib/sesion';
import { evitarRuedaEnNumeros } from './lib/ruedaEnNumeros';

// Antes de cualquier llamada: NOVA y el correo solo responden con sesión.
instalarSesionEnApi();
// Y que la rueda del mouse no cambie precios ni cantidades sola.
evitarRuedaEnNumeros();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
