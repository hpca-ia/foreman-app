-- 099 · Las versiones del cronograma, para poder comparar contra lo prometido.
--
-- Un cronograma no es estático: se corrige, se traslapa, se parte en etapas,
-- se acomoda cuando entra una orden de cambio. Eso está bien —un cronograma
-- que no cambia es uno que nadie está usando— pero deja una pregunta sin
-- respuesta: ¿CUÁNTO NOS CORRIMOS?
--
-- Hoy no se puede contestar. La pantalla muestra el plan de hoy y el de la
-- semana pasada no existe en ningún lado, así que "vamos quince días atrasados"
-- es una impresión y no un dato. Y cuando hay que justificar un atraso ante un
-- cliente o pedir una ampliación de plazo, una impresión no sirve.
--
-- Se guarda una FOTO: las barras como estaban, con sus duraciones, sus fechas y
-- sus dependencias. No se restaura —volver atrás borraría el avance ya
-- cargado— se COMPARA, que es lo que hace falta.
--
-- La foto va en JSON y no en tablas aparte a propósito: es un documento
-- cerrado que no se edita nunca más. Normalizarlo sería poder modificar el
-- pasado, que es exactamente lo que no queremos.

create table if not exists public.cronograma_versiones (
  id          bigserial primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  obra_id     bigint,
  nombre      text not null,
  -- POR QUÉ se guardó. Es lo que convierte una lista de fechas en una
  -- historia: "antes de la orden de cambio 3", "lo que se firmó con el
  -- cliente", "replanificación por la lluvia de mayo".
  motivo      text,
  -- La primera, contra la que se mide todo lo demás. Una por obra: si hubiera
  -- dos, "atrasado" dejaría de querer decir algo.
  es_linea_base boolean not null default false,
  -- La foto: actividades y dependencias como estaban.
  foto        jsonb not null,
  dias        int,
  fin         date,
  creado_por    bigint,
  creado_nombre text,
  created_at  timestamptz not null default now()
);
create index if not exists crono_versiones_proyecto on public.cronograma_versiones (lead_id, created_at desc);

-- Una sola línea base por proyecto, sostenido por la base y no por la pantalla.
create unique index if not exists crono_una_linea_base
  on public.cronograma_versiones (lead_id) where es_linea_base;

do $$
begin
  execute 'alter table public.cronograma_versiones enable row level security';
  execute 'drop policy if exists "equipo foreman" on public.cronograma_versiones';
  execute 'create policy "equipo foreman" on public.cronograma_versiones for all to authenticated using (true) with check (true)';
end $$;
