-- 071 · Una observación la arregla más de uno.
--
-- `responsable_id` era uno solo, y en obra casi nunca lo es: la fisura la mira
-- el residente y la tapa el albañil, la instalación la rehace el eléctrico con
-- el maestro al lado. Con un solo casillero, el que anotaba elegía a uno y le
-- avisaba al otro por WhatsApp — y el que no quedó anotado no ve nada en su
-- pantalla, que es justamente lo que esto viene a resolver.
--
-- Tabla aparte y no un arreglo de ids en la fila: la pregunta que más se hace
-- es "¿qué observaciones tengo yo?", y eso con un jsonb se contesta leyendo
-- todas las observaciones de la oficina para filtrarlas en la app.
--
-- `responsable_id` se queda y se sigue llenando con el primero. Hay pantallas
-- que lo muestran y correos que lo nombran; sacarlo ahora rompería eso para
-- ganar prolijidad, que es un mal cambio.

create table if not exists public.observacion_responsables (
  id             bigserial primary key,
  observacion_id bigint not null references public.obra_observaciones(id) on delete cascade,
  usuario_id     bigint not null,
  nombre         text,
  created_at     timestamptz not null default now(),
  unique (observacion_id, usuario_id)
);
create index if not exists obs_resp_usuario on public.observacion_responsables (usuario_id);

-- Las que ya tienen un responsable entran a la tabla nueva: si no, el día que
-- la pantalla lea de acá, todas las observaciones existentes aparecerían sin
-- nadie a cargo.
insert into public.observacion_responsables (observacion_id, usuario_id, nombre)
select id, responsable_id, responsable_nombre
  from public.obra_observaciones
 where responsable_id is not null
on conflict do nothing;

alter table public.observacion_responsables enable row level security;
drop policy if exists "equipo foreman" on public.observacion_responsables;
create policy "equipo foreman" on public.observacion_responsables
  for all to authenticated using (true) with check (true);
