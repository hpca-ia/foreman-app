-- 117 · Cada entrega del libro de obra, con su acuse y su conformidad.
--
-- El libro se entrega: a la fiscalización, al cliente, a un perito. Hasta
-- ahora salía el correo y ahí terminaba todo — no quedaba constancia de a
-- quién se le mandó, ni de si llegó, ni de si lo miró.
--
-- Eso es justo lo que hace falta cuando se discute: "el libro de septiembre te
-- lo mandé el 3 de octubre" no vale nada sin el acuse al lado. Y un libro que
-- rebotó sin que nadie se entere es peor que uno que no se mandó: el que lo
-- pidió cree que ya lo tiene y no lo vuelve a pedir.
--
-- Una fila por persona y por entrega. Por persona porque cada una tiene su
-- enlace —la conformidad es de alguien, no del envío— y por entrega porque lo
-- que se aprueba es un PERÍODO: "revisé el libro del 1 al 30 de septiembre".
-- El mes siguiente es otra entrega y otra conformidad.

create table if not exists public.libro_envios (
  id              bigserial primary key,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  -- Qué tramo del libro se entregó. Es lo que la persona confirma haber
  -- revisado, y sin eso la conformidad no dice sobre qué es.
  desde           date,
  hasta           date,
  dias            integer,
  nombre          text,
  email           text not null,
  -- Su llave personal. El que recibe el libro casi nunca tiene cuenta en
  -- FOREMAN: entra por el enlace del correo, desde el teléfono.
  token           text unique,
  -- El acuse de Resend: qué pasó con ESE correo, a ESA dirección.
  envio_id        text,
  envio_estado    text,
  envio_at        timestamptz,
  -- Lo abrió por su enlace. Distingue "no contestó" de "ni lo miró".
  visto_at        timestamptz,
  conforme_at     timestamptz,
  conforme_ip     text,
  observacion     text,
  observacion_at  timestamptz,
  creado_por      bigint,
  creado_nombre   text,
  created_at      timestamptz not null default now()
);

create index if not exists libro_envios_lead on public.libro_envios (lead_id, created_at desc);
create index if not exists libro_envios_token on public.libro_envios (token);

alter table public.libro_envios enable row level security;
do $$ begin
  create policy "equipo foreman" on public.libro_envios for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table public.libro_envios is
  'Cada vez que se entregó un tramo del libro de obra, a quién, si llegó y si lo dio por revisado.';
