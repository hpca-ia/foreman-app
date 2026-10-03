-- 065 · Cuándo se mandó, cuándo se pagó, cuándo entró a bodega.
--
-- La solicitud ya sabía quién aprobó y quién compró, pero no las dos fechas
-- que uno pregunta por teléfono: "¿ya se pagó?" y "¿ya llegó?". Sin eso, el
-- estado de una compra se reconstruye leyendo el historial línea por línea.
--
-- Pagar NO es un estado del flujo, y por eso no se agrega uno.
--
--   El flujo contesta "a quién le toca ahora" —pedir, aprobar, comprar,
--   recibir—, y es una sola fila de fichas que avanza. El pago no entra ahí:
--   se paga antes de recibir (anticipo), después de recibir (crédito a 30
--   días) o a mitad de camino. Metido como estado obligaría a elegir un orden
--   que en obra no existe, y la primera compra pagada por adelantado quedaría
--   trabada esperando un paso que ya ocurrió.
--
--   Como fecha, convive con cualquier paso: la compra sigue su camino y
--   "pagado" se prende cuando se pagó, no cuando al flujo le toca.
--
-- `enviado_at` es la fecha del primer pedido de visto, no la del último: lo que
-- se quiere medir es cuánto tardó en aprobarse desde que se pidió, y reenviar
-- una solicitud devuelta no vuelve a empezar esa cuenta.
--
-- Las tres de bodega van ahora, vacías, para que el módulo de ingreso a bodega
-- —recibir el material contra el pedido, contarlo y darlo de alta— no tenga
-- que pedir otra migración el día que exista. Una columna nula no cuesta nada;
-- una migración a destiempo frena una semana de trabajo.

alter table public.compras_solicitudes add column if not exists enviado_at    timestamptz;

alter table public.compras_solicitudes add column if not exists pagado_at     timestamptz;
alter table public.compras_solicitudes add column if not exists pagado_por    bigint;
alter table public.compras_solicitudes add column if not exists pagado_nombre text;
alter table public.compras_solicitudes add column if not exists pagado_monto  numeric(14,2);

alter table public.compras_solicitudes add column if not exists bodega_at     timestamptz;
alter table public.compras_solicitudes add column if not exists bodega_por    bigint;
alter table public.compras_solicitudes add column if not exists bodega_nombre text;

-- Lo ya enviado tiene fecha: la del primer paso a "esperando visto" que quedó
-- escrito en el historial. Es la misma pregunta contestada con lo que ya hay,
-- en vez de dejar en blanco el pasado.
update public.compras_solicitudes s
   set enviado_at = h.cuando
  from (
    select solicitud_id, min(created_at) as cuando
      from public.compras_historial
     where estado_nuevo = 'pendiente_aprobacion'
     group by solicitud_id
  ) h
 where h.solicitud_id = s.id
   and s.enviado_at is null;
