-- 101 · Las etapas del cronograma.
--
-- Una obra no se lee como una lista de cuarenta barras: se lee por etapas.
-- "Demoliciones", "Obra gris", "Instalaciones", "Acabados", "Entrega". Es como
-- se habla en la reunión de obra, es como se le explica al cliente por qué
-- vamos atrasados, y es lo que permite mirar el cronograma sin leerlo entero.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA DE TEXTO EN CADA ACTIVIDAD:
--
-- · Una etapa tiene que poder existir VACÍA. Así se trabaja de verdad: se
--   escriben las cuatro etapas de la obra y recién después se van metiendo las
--   actividades adentro. Con el nombre repetido en cada actividad, una etapa
--   sin actividades no existe en ningún lado y no se puede crear.
-- · Se reordenan con flechas. Mover una etapa entera es cambiar UN número acá;
--   con el nombre en cada fila habría que renumerar todas sus actividades y
--   el orden quedaría a merced de que ninguna se escape.
-- · Se renombran sin tocar nada más. "Etapa 1" pasa a "Demoliciones" y las
--   doce actividades de adentro no se enteran.
--
-- El orden de las etapas NO manda sobre las fechas. Una etapa puede traslaparse
-- con la siguiente —los acabados de la planta baja arrancan mientras arriba
-- todavía hay obra gris— y eso lo dicen las dependencias, que es donde vive el
-- tiempo. La etapa es cómo se LEE el cronograma, no cómo se calcula.

create table if not exists public.cronograma_fases (
  id          bigserial primary key,
  lead_id     bigint not null references public.leads(id) on delete cascade,
  nombre      text not null,
  orden       int not null default 0,
  creado_por    bigint,
  creado_nombre text,
  created_at  timestamptz not null default now()
);
create index if not exists crono_fases_por_proyecto on public.cronograma_fases (lead_id, orden);

-- En qué etapa va cada actividad. Nula es válida y quiere decir "todavía sin
-- etapa": esas van juntas al final, a la vista, para que se note que faltan.
--
-- `on delete set null`: borrar una etapa no borra la obra que hay adentro.
-- Es la equivocación más fácil de cometer —uno borra "Etapa 2" pensando que
-- borra un título— y la más cara de todas.
alter table public.cronograma_actividades
  add column if not exists fase_id bigint references public.cronograma_fases(id) on delete set null;

do $$
begin
  execute 'alter table public.cronograma_fases enable row level security';
  execute 'drop policy if exists "equipo foreman" on public.cronograma_fases';
  execute 'create policy "equipo foreman" on public.cronograma_fases for all to authenticated using (true) with check (true)';
end $$;
