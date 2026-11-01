-- 151 · Anular una orden de cambio, y la que la reemplaza.
--
-- Una orden aprobada con un error —una cantidad mal medida, un precio viejo,
-- el rubro equivocado— no se corrige editándola: ya está firmada. Se anula y se
-- emite otra, y el papel nuevo tiene que decir a cuál reemplaza. Así es como se
-- hace en obra, y así tiene que quedar escrito.
--
-- ANULAR TENÍA QUE SACAR SUS RUBROS DEL CONTROL, Y NO LO HACÍA.
--
-- El botón marcaba la casilla y nada más: los rubros que esa orden había metido
-- al aprobarse seguían ahí, sumando al contrato vigente. Una orden anulada y su
-- reemplazo quedaban las dos adentro, el contrato inflado por el valor entero
-- de la anulada, y nada que lo dijera. Eso ahora se hace de verdad: anular
-- deshace lo que hizo aprobar.
--
-- Y QUEDA ESCRITO POR QUÉ. "Anulada" sin motivo, seis meses después, no le
-- explica nada a nadie —ni al cliente que pregunta por qué recibió dos órdenes
-- por lo mismo, ni a nosotros—. El motivo, quién la anuló y cuándo.

alter table public.ordenes_cambio add column if not exists anulada_at    timestamptz;
alter table public.ordenes_cambio add column if not exists anulada_por   bigint;
alter table public.ordenes_cambio add column if not exists anulada_nombre text;
alter table public.ordenes_cambio add column if not exists anulada_motivo text;

-- A cuál reemplaza esta orden. La anulada se entera por el otro lado: la
-- consulta "¿quién me reemplazó?" es la que importa cuando alguien abre una
-- orden anulada y quiere saber dónde terminó ese trabajo.
alter table public.ordenes_cambio add column if not exists reemplaza_a bigint
  references public.ordenes_cambio(id) on delete set null;

create index if not exists ordenes_cambio_reemplaza on public.ordenes_cambio (reemplaza_a);

comment on column public.ordenes_cambio.anulada_motivo is
  'Por qué se anuló. Sin esto, "anulada" seis meses después no le explica nada a nadie.';
comment on column public.ordenes_cambio.reemplaza_a is
  'La orden anulada que esta reemplaza. El papel nuevo la menciona, y desde la anulada se puede ver dónde terminó ese trabajo.';
