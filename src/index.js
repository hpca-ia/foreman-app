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

// El portal del cliente es otra aplicación que vive en la misma dirección.
//
// Entra por ?cliente=LLAVE y no carga FOREMAN: ni la sesión, ni el menú, ni
// una pantalla de login que no tiene cómo pasar. Todo lo que ve viene del
// servidor, que es quien cambia la llave por un proyecto; el navegador del
// cliente no tiene ninguna credencial de la base, y por eso un enlace
// reenviado no abre nada más que ese proyecto.
const llaveCliente = new URLSearchParams(window.location.search).get('cliente');

if (llaveCliente) {
  const Portal = React.lazy(() => import('./portal/PortalCliente'));
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={null}>
        <Portal token={llaveCliente} />
      </React.Suspense>
    </React.StrictMode>
  );
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
