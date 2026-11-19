-- 191 · Qué archivos se le piden aprobar al cliente en cada pedido.
--
-- Hernán, 19/11/2026, con FOGA: «cada vez que se sube un archivo se puede
-- pedir aprobación de ese archivo nuevo, el anterior ya se aprobó... se sube
-- la cotización, se debe poder pedir que se apruebe específicamente esa
-- cotización, no lo anterior que ya estaba».
--
-- Un pedido era del punto entero: el cliente tenía «Lo apruebo» delante de
-- todos los archivos del punto, y en el registro quedaban todos como
-- aprobados otra vez. Ahora el pedido dice cuáles son.
--
--   · `aprobaciones_cliente.pide_archivos` — los id de `proyecto_archivos`
--     que se le piden aprobar en ESE pedido. Vacío (null) es como hasta hoy:
--     todo lo que tenga el punto.
--
-- Nace vacía: los pedidos que ya hay siguen siendo del punto entero. No cambia
-- ningún dato existente. Se puede correr más de una vez.

alter table public.aprobaciones_cliente
  add column if not exists pide_archivos jsonb;

comment on column public.aprobaciones_cliente.pide_archivos is
  'Los id de proyecto_archivos que se le piden aprobar en este pedido: [12, 15]. Null si es todo lo que tiene el punto.';
