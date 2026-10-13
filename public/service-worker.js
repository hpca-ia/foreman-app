// EL INTERRUPTOR DE EMERGENCIA.
//
// Si alguna vez este dominio registró un trabajador de servicio —una versión
// vieja de la app, una prueba— ese trabajador sigue vivo en el navegador de
// quien lo haya cargado, y sirve la aplicación desde su propia memoria. La
// consecuencia es que se despliega código nuevo, el servidor lo entrega bien,
// y la persona sigue viendo el de hace una semana sin ninguna manera de
// darse cuenta.
//
// Este archivo no guarda nada: se da de baja a sí mismo, borra todo lo que
// haya quedado cacheado y recarga las pestañas abiertas. Si no hay ninguno
// registrado, no hace nada y no molesta.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map(n => caches.delete(n)));
    await self.registration.unregister();
    const clientes = await self.clients.matchAll({ type: "window" });
    clientes.forEach(c => c.navigate(c.url));
  })());
});
