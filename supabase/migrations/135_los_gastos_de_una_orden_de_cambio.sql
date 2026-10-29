-- 135 · Lo que de verdad costó una orden de cambio.
--
-- Hasta ahora el costo de una orden vivía en una sola columna: el costo
-- unitario de cada partida, que sale de la proforma del proveedor. Eso alcanza
-- cuando la orden es comprar algo y revenderlo, y no alcanza nunca más:
--
--   · el flete del generador, que no es una partida
--   · la mano de obra propia que lo instala
--   · el andamio alquilado para poner el vinil
--   · la segunda proforma, de otro proveedor, por una parte del trabajo
--
-- Todo eso es plata que sale por esta orden y que no tiene dónde ir, así que
-- el margen que se ve en pantalla es más alto que el de verdad. Un margen
-- optimista es peor que ninguno: con ese número se decide el precio de la
-- próxima.
--
-- Entonces el costo de una orden pasa a ser la suma de SUS GASTOS, y un gasto
-- puede nacer de dos maneras: leído de una proforma por NOVA, o escrito a mano
-- el día que se paga. Las dos cuentan igual.
--
-- EL MONTO VA SIN IVA, como el costo de las partidas y por la misma razón: la
-- orden se cobra sin IVA y el margen tiene que medir lo mismo contra lo mismo.
-- Se guarda aparte qué porcentaje se le sacó, para poder cuadrarlo contra el
-- papel del proveedor cuando alguien lo pida.

create table if not exists public.orden_cambio_gastos (
  id            bigserial primary key,
  orden_id      bigint not null references public.ordenes_cambio(id) on delete cascade,
  descripcion   text not null,
  proveedor     text,
  -- SIN IVA. Lo que le cuesta a la obra, medido como se mide el precio.
  monto         numeric(14,2) not null default 0,
  iva           numeric(5,2) not null default 0,
  -- cotizado: todavía es una promesa del proveedor · real: ya se pagó.
  -- Son dos números distintos y el segundo es el que manda: una liquidación
  -- hecha solo de cotizaciones es una liquidación de antes de la obra.
  estado        text not null default 'cotizado',
  cotizacion_id bigint references public.orden_cambio_cotizaciones(id) on delete set null,
  creado_por    bigint, creado_nombre text,
  created_at    timestamptz not null default now()
);
create index if not exists oc_gastos_orden on public.orden_cambio_gastos (orden_id);

alter table public.orden_cambio_gastos enable row level security;
do $$ begin
  create policy "equipo foreman" on public.orden_cambio_gastos for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.orden_cambio_gastos is
  'Lo que cuesta una orden de cambio y no es el costo de una partida: fletes, mano de obra, alquileres, una segunda proforma. Montos SIN IVA, como el precio que cobra la orden.';

-- EL GASTO SUELTO TAMBIÉN ES UN BENEFICIO (en contra).
--
-- Los beneficios de la obra se arman solos a partir de las órdenes aprobadas,
-- una fila por partida con costo. Un gasto que no es una partida no tenía cómo
-- llegar ahí, así que la página de Beneficios mostraba más utilidad de la que
-- la obra tiene. Entra como una fila sin precio: lo presupuestado es cero
-- porque no se le cobró nada al cliente, y lo real es lo que salió.
alter table public.obra_beneficios
  add column if not exists orden_cambio_gasto_id bigint references public.orden_cambio_gastos(id) on delete cascade;

create index if not exists beneficios_gasto_oc
  on public.obra_beneficios(orden_cambio_gasto_id) where orden_cambio_gasto_id is not null;

comment on column public.obra_beneficios.orden_cambio_gasto_id is
  'El gasto de la orden de cambio que creó esta fila. Sin precio: es costo que no se le cobró a nadie.';
