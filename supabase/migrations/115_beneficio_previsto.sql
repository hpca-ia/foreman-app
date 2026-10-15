-- 115 · Un beneficio previsto no es un beneficio cobrado.
--
-- Una proforma dice lo que va a costar, no lo que costó: entre que el
-- proveedor cotiza y la factura llega se cae la mitad —cambió el precio, no
-- había stock, se compró en otro lado—. Meter eso en el total de la obra junto
-- con lo ya comprado es contar plata que todavía no existe, y es justo el
-- error que hace que una obra parezca rentable hasta el último mes.
--
-- Pero tampoco se puede no cargarlo: adelantar el beneficio de un rubro —"esto
-- lo vamos a comprar un 20% abajo"— es lo que deja decidir con tiempo dónde se
-- puede gastar más. Entonces se carga, y se dice cuál es cuál.
--
-- Lo que viene de una proforma nace PREVISTO. Lo que se escribe a mano lo
-- decide quien lo escribe: muchos beneficios reales no tienen papel —se negoció
-- por teléfono, el contratista bajó el precio— y esos ya están cobrados.

alter table public.obra_beneficios
  add column if not exists estado text not null default 'confirmado';
alter table public.obra_beneficios
  add column if not exists confirmado_at timestamptz;

comment on column public.obra_beneficios.estado is
  'previsto (una proforma, todavía no se compró) o confirmado (ya se compró a ese precio). Solo el confirmado suma a los números de la obra.';
