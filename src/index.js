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
// El acta de reunión, para quien la firma. Misma idea que el portal del
// cliente y por la misma razón: el que tiene que dar conformidad —el cliente,
// la fiscalización, un contratista— no tiene cuenta acá, y pedirle que se
// registre para leer un acta es garantizar que no la lea.
const llaveActa = new URLSearchParams(window.location.search).get('acta');
// El libro de obra, para quien lo da por revisado. Misma puerta y misma razón:
// la fiscalización, el cliente o un perito no tienen cuenta acá.
const llaveLibro = new URLSearchParams(window.location.search).get('libro');
// La orden de cambio, para quien la aprueba. El fiscalizador y el contratante
// no tienen cuenta, y mientras no firmen el trabajo no se ejecuta.
const llaveOdc = new URLSearchParams(window.location.search).get('odc');

if (llaveOdc) {
  const FirmaOdc = React.lazy(() => import('./portal/AprobarOrdenDeCambio'));
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={null}>
        <FirmaOdc token={llaveOdc} />
      </React.Suspense>
    </React.StrictMode>
  );
} else if (llaveLibro) {
  const FirmaLibro = React.lazy(() => import('./portal/FirmaDelLibro'));
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={null}>
        <FirmaLibro token={llaveLibro} />
      </React.Suspense>
    </React.StrictMode>
  );
} else if (llaveActa) {
  const Firma = React.lazy(() => import('./portal/FirmaDelActa'));
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={null}>
        <Firma token={llaveActa} />
      </React.Suspense>
    </React.StrictMode>
  );
} else if (llaveCliente) {
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
